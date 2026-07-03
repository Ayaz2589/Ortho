// Capture → ScanDocumentText. The ONLY file that touches Vision/PDFKit types;
// no parsing decisions live here (spec 014, contracts/scan-parser.md §stages).
//
// Images: structured document OCR (RecognizeDocumentsRequest, iOS 26) for
// table detection, falling back to classic text recognition clustered into
// lines by Y position. PDFs: text layer first (digital statements are
// lossless), rendered + OCR'd only for pages without one (research R2/R3).
// Everything is on-device; capture data is released when this returns (FR-003).

import Foundation
import UIKit
import Vision
import PDFKit

enum ScanExtractionError: Error {
    case unreadableCapture
}

enum ScanTextExtractor {

    // MARK: - Images (camera / photo library / image files)

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
    /// the row regexes can see column boundaries.
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
    /// captures can be 4x that. Downscaling also bounds peak memory (R12).
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
