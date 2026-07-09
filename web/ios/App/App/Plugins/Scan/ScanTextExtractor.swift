// Capture/PDF → ScanDocumentText JSON. The ONLY file in this plugin that
// touches Vision/PDFKit types; no parsing/merchant/category decisions live
// here — those moved to TypeScript (web/lib/scan/scanHeuristics.ts,
// scanParser.ts, scanInference.ts) per
// specs/021-capacitor-ios-consolidation/research.md §4.1.
//
// Ported near-verbatim from iOS/Ortho-iOS/Services/Scan/ScanTextExtractor.swift
// (spec 014 original) into this Capacitor plugin (spec 021). The extraction
// ALGORITHMS are unchanged: structured document OCR (RecognizeDocumentsRequest,
// iOS 26) for table detection, falling back to classic text recognition
// clustered into lines by Y position; PDFs use the digital text layer first,
// rendered + OCR'd only for pages without one. Everything is on-device;
// capture data is released when this returns (FR-008). What's new versus the
// frozen original is purely the JSON boundary: `ScanDocumentText` and its
// nested types now expose `jsObject`/`init(jsObject:)` so `ScanPlugin.swift`
// can cross the JS bridge with the exact shape documented in
// specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md and
// data-model.md (`{ pages: [{ lines: [{text, frame}], tables: [{rows}] }] }`,
// normalized 0-1 frames, top-left origin).
//
// Not compiled in this environment (no Xcode/macOS) — see the note atop
// ScanPlugin.swift. Build/behavior verification happens in CI.

import Foundation
import UIKit
import Vision
import PDFKit

nonisolated enum ScanExtractionError: Error {
    case unreadableCapture
}

// MARK: - JSON-boundary value types
//
// Deliberately NOT the full `ScanModels.swift` contract from the frozen app —
// `ParsedCandidate`, `GuessedField`, `ScanContext`, etc. have no native
// representation here; they're pure TypeScript now (data-model.md). Only the
// OCR/PDF *output* shape (`ScanDocumentText`) still needs a Swift type, since
// this file is what produces it.

/// Engine-agnostic text of one capture. Frames are normalized (0-1),
/// origin top-left, so "bottom of the receipt" heuristics work regardless
/// of source resolution — flipped from Vision's bottom-left convention
/// before crossing the bridge (contract §ScanDocumentText).
nonisolated struct ScanDocumentText: Equatable {
    struct Line: Equatable {
        var text: String
        /// Kept as `CGRect` internally (the clustering math below leans on
        /// `midY`/`minX`/`union`); converted to the normalized JSON frame
        /// only at the `jsObject` boundary.
        var frame: CGRect
    }

    struct Table: Equatable {
        /// Cell texts, row-major, as detected by structured OCR.
        var rows: [[String]]
    }

    struct Page: Equatable {
        var lines: [Line]
        var tables: [Table]
    }

    var pages: [Page]
}

// MARK: - JSON conversion (Swift -> [String: Any], for CAPPluginCall.resolve)

extension ScanDocumentText.Line {
    var jsObject: [String: Any] {
        [
            "text": text,
            "frame": [
                "x": Double(frame.origin.x),
                "y": Double(frame.origin.y),
                "width": Double(frame.width),
                "height": Double(frame.height)
            ]
        ]
    }

    /// Reverse of `jsObject`, used by `ScanPlugin.rescue(_:)` to decode the
    /// `page` argument JS sends back in. Returns nil on any malformed input
    /// rather than throwing — a malformed page is treated as "nothing to
    /// rescue", never a crash.
    init?(jsObject: [String: Any]) {
        guard let text = jsObject["text"] as? String,
              let frameObject = jsObject["frame"] as? [String: Any],
              let x = Self.number(frameObject["x"]),
              let y = Self.number(frameObject["y"]),
              let width = Self.number(frameObject["width"]),
              let height = Self.number(frameObject["height"]) else {
            return nil
        }
        self.text = text
        self.frame = CGRect(x: x, y: y, width: width, height: height)
    }

    /// Bridged JSON numbers can surface as `Double`, `NSNumber`, or `Int`
    /// depending on how they crossed the JS bridge — accept all three rather
    /// than betting on one.
    private static func number(_ value: Any?) -> Double? {
        if let double = value as? Double { return double }
        if let number = value as? NSNumber { return number.doubleValue }
        if let int = value as? Int { return Double(int) }
        return nil
    }
}

extension ScanDocumentText.Table {
    var jsObject: [String: Any] { ["rows": rows] }

    init?(jsObject: [String: Any]) {
        guard let rows = jsObject["rows"] as? [[String]] else { return nil }
        self.rows = rows
    }
}

extension ScanDocumentText.Page {
    var jsObject: [String: Any] {
        [
            "lines": lines.map(\.jsObject),
            "tables": tables.map(\.jsObject)
        ]
    }

    /// Decodes a `ScanDocumentTextPage` JS object (see contracts/scan-plugin-api.md);
    /// malformed/missing `lines`/`tables` degrade to empty arrays rather than
    /// failing the whole page, matching the contract's "absence is an empty
    /// array, never null" validation rule (data-model.md).
    init(jsObject: [String: Any]) {
        let lineObjects = jsObject["lines"] as? [[String: Any]] ?? []
        let tableObjects = jsObject["tables"] as? [[String: Any]] ?? []
        self.lines = lineObjects.compactMap(ScanDocumentText.Line.init(jsObject:))
        self.tables = tableObjects.compactMap(ScanDocumentText.Table.init(jsObject:))
    }
}

extension ScanDocumentText {
    var jsObject: [String: Any] { ["pages": pages.map(\.jsObject)] }
}

nonisolated enum ScanTextExtractor {

    // MARK: - Images (camera capture)

    /// Downscale/orient/OCR one already-deskewed capture (the `capture()`
    /// plugin method's live path — OCR runs natively during capture so JS
    /// never needs a second round trip, per contract §capture).
    static func extractSinglePage(from image: UIImage) async -> ScanDocumentText.Page {
        guard let cgImage = downscaled(image) else {
            return ScanDocumentText.Page(lines: [], tables: [])
        }
        return await extractPage(from: cgImage)
    }

    /// General multi-image entry point, kept for parity with the frozen
    /// original's API shape (it served the old SwiftUI photo-library picker).
    /// The current plugin contract only drives this with a single image from
    /// `capture()`; nothing outside this file calls it with more than one.
    static func extract(images: [UIImage]) async throws -> ScanDocumentText {
        var pages: [ScanDocumentText.Page] = []
        for image in images {
            guard let cgImage = downscaled(image) else { continue }
            pages.append(await extractPage(from: cgImage))
        }
        return ScanDocumentText(pages: pages)
    }

    // MARK: - PDFs

    static func extract(pdfAt url: URL) async throws -> ScanDocumentText {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let document = PDFDocument(url: url) else {
            throw ScanExtractionError.unreadableCapture
        }
        var pages: [ScanDocumentText.Page] = []
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            let text = page.string ?? ""
            if text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 12 {
                pages.append(pageFromTextLayer(text))
            } else if let cgImage = render(page) {
                // Scanned/photographed PDF page — same OCR path as images.
                pages.append(await extractPage(from: cgImage))
            }
        }
        return ScanDocumentText(pages: pages)
    }

    /// Digital PDFs give us the text layer directly — lossless and ordered by
    /// content stream (top-down for row-per-drawString statements). Frames are
    /// approximated by line index; the parser is label-driven, not
    /// geometry-driven (research R3).
    private static func pageFromTextLayer(_ text: String) -> ScanDocumentText.Page {
        let raw = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let count = max(raw.count, 1)
        let lines = raw.enumerated().map { index, line in
            ScanDocumentText.Line(
                text: line,
                frame: CGRect(x: 0, y: CGFloat(index) / CGFloat(count),
                              width: 1, height: 1 / CGFloat(count))
            )
        }
        return ScanDocumentText.Page(lines: lines, tables: [])
    }

    private static func render(_ page: PDFPage) -> CGImage? {
        let bounds = page.bounds(for: .mediaBox)
        guard bounds.width > 0, bounds.height > 0 else { return nil }
        let scale: CGFloat = 2
        let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            ctx.cgContext.translateBy(x: 0, y: size.height)
            ctx.cgContext.scaleBy(x: scale, y: -scale)
            page.draw(with: .mediaBox, to: ctx.cgContext)
        }
        return image.cgImage
    }

    // MARK: - OCR

    private static func extractPage(from cgImage: CGImage) async -> ScanDocumentText.Page {
        if #available(iOS 26.0, *) {
            if let page = try? await extractStructured(from: cgImage),
               !(page.lines.isEmpty && page.tables.isEmpty) {
                return page
            }
        }
        return (try? await extractClustered(from: cgImage))
            ?? ScanDocumentText.Page(lines: [], tables: [])
    }

    /// Structured document understanding: detected tables become
    /// `ScanDocumentText.Table` (statement rows arrive pre-segmented); the
    /// transcript becomes ordered lines.
    @available(iOS 26.0, *)
    private static func extractStructured(from cgImage: CGImage) async throws -> ScanDocumentText.Page {
        let request = RecognizeDocumentsRequest()
        let observations = try await request.perform(on: cgImage)
        guard let document = observations.first?.document else {
            return ScanDocumentText.Page(lines: [], tables: [])
        }

        var tables: [ScanDocumentText.Table] = []
        for table in document.tables {
            var rows: [[String]] = []
            for row in table.rows {
                rows.append(row.map { cell in
                    cell.content.text.transcript
                        .replacingOccurrences(of: "\n", with: " ")
                        .trimmingCharacters(in: .whitespaces)
                })
            }
            if !rows.isEmpty { tables.append(ScanDocumentText.Table(rows: rows)) }
        }

        let transcriptLines = document.text.transcript
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let count = max(transcriptLines.count, 1)
        let lines = transcriptLines.enumerated().map { index, text in
            ScanDocumentText.Line(
                text: text,
                frame: CGRect(x: 0, y: CGFloat(index) / CGFloat(count),
                              width: 1, height: 1 / CGFloat(count))
            )
        }
        return ScanDocumentText.Page(lines: lines, tables: tables)
    }

    /// Classic text recognition, observations clustered into reading-order
    /// lines by Y-center proximity. Multi-column gaps join with two spaces so
    /// the row regexes (now in scanHeuristics.ts) can see column boundaries.
    private static func extractClustered(from cgImage: CGImage) async throws -> ScanDocumentText.Page {
        let observations: [VNRecognizedTextObservation] = try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: (request.results as? [VNRecognizedTextObservation]) ?? [])
                }
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }

        struct Fragment {
            let text: String
            let frame: CGRect // normalized, top-left origin
        }
        let fragments: [Fragment] = observations.compactMap { obs in
            guard let text = obs.topCandidates(1).first?.string,
                  !text.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
            // Vision boxes are bottom-left origin; flip to top-left.
            let b = obs.boundingBox
            let frame = CGRect(x: b.origin.x, y: 1 - b.origin.y - b.height,
                               width: b.width, height: b.height)
            return Fragment(text: text, frame: frame)
        }
        .sorted { $0.frame.midY < $1.frame.midY }

        var groups: [[Fragment]] = []
        for fragment in fragments {
            if var last = groups.last, let anchor = last.first {
                let tolerance = max(0.012, anchor.frame.height * 0.6)
                if abs(fragment.frame.midY - anchor.frame.midY) <= tolerance {
                    last.append(fragment)
                    groups[groups.count - 1] = last
                    continue
                }
            }
            groups.append([fragment])
        }

        let lines: [ScanDocumentText.Line] = groups.map { group in
            let ordered = group.sorted { $0.frame.minX < $1.frame.minX }
            let text = ordered.map(\.text).joined(separator: "  ")
            let frame = ordered.dropFirst().reduce(ordered[0].frame) { $0.union($1.frame) }
            return ScanDocumentText.Line(text: text, frame: frame)
        }
        return ScanDocumentText.Page(lines: lines, tables: [])
    }

    /// OCR works best (and fastest) around ~2000px on the long edge; camera
    /// captures can be 4x that. Downscaling also bounds peak memory, and (via
    /// `UIGraphicsImageRenderer`'s draw-into-bitmap-context behavior) bakes
    /// any EXIF orientation into pixels so the segmentation quad and
    /// downstream OCR see the image upright.
    private static func downscaled(_ image: UIImage) -> CGImage? {
        guard let cgImage = image.cgImage else { return nil }
        let longEdge = max(cgImage.width, cgImage.height)
        let target = 2200
        guard longEdge > target else { return cgImage }
        let ratio = CGFloat(target) / CGFloat(longEdge)
        let size = CGSize(width: CGFloat(cgImage.width) * ratio,
                          height: CGFloat(cgImage.height) * ratio)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }
}
