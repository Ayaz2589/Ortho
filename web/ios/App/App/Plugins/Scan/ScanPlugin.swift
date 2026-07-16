// NOT COMPILED IN THIS ENVIRONMENT. This plugin (and its three companion
// files in this directory) was authored in a Linux sandbox with no Xcode/
// macOS toolchain available — `xcodebuild` cannot run here. Every API used
// below was cross-checked against the actual installed Capacitor 8.4.1
// runtime (web/node_modules/@capacitor/ios, and the SPM binary it resolves
// to per web/ios/App/CapApp-SPM/Package.swift) and against Capacitor's
// official iOS plugin guide (docs/plugins/creating-plugins/ios-guide.md),
// but it has never been built. Build/behavior correctness is verified by CI
// (.github/workflows/ios-ci.yml and, once added, capacitor-ios-ci.yml) on a
// macOS runner — see CLAUDE.md's iOS CI section.
//
// NOTE on the `@CapacitorPlugin(name:, permissions:)` attribute mentioned in
// specs/021-capacitor-ios-consolidation/contracts/scan-plugin-api.md and
// research-report-full.md: that declarative annotation syntax is Capacitor's
// ANDROID (Kotlin) plugin pattern (`@CapacitorPlugin(name = ..., permissions
// = [@Permission(...)])`, confirmed against ionic-team/capacitor-docs'
// android-guide.md). iOS plugins — confirmed against the current official
// ios-guide.md and every first-party plugin actually shipped in this
// project's node_modules (StatusBarPlugin.swift, AppPlugin.swift) — use a
// different, manual pattern instead: `CAPBridgedPlugin` conformance
// (`identifier`/`jsName`/`pluginMethods`) plus overriding the
// `checkPermissions`/`requestPermissions` methods `CAPPlugin` already
// declares, driven by the `NSCameraUsageDescription` Info.plist key at the
// OS level (no separate alias-to-plist-key mapping exists on iOS the way it
// does on Android). This file follows the real iOS pattern — semantically
// identical outcome (plugin named "Scan", camera-permission gated, same
// method surface) — flagged here since it's the one place this port
// deliberately diverges from the contract doc's literal syntax.

import Foundation
import UIKit
import AVFoundation
import Capacitor

@objc(ScanPlugin)
public class ScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScanPlugin"
    public let jsName = "Scan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "extractPDF", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refineMerchant", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rescue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    /// The capture UI currently on screen, if any. One session at a time —
    /// `capture()` rejects re-entrant calls rather than queuing them.
    private var activeCapture: ScanCaptureController?
    /// The still-unresolved `capture()` call. Cleared as soon as the first
    /// photo of the session resolves it; every photo after that goes out via
    /// the `pageCaptured` event instead (contract §Events), never a second
    /// promise resolution.
    private var pendingCaptureCall: CAPPluginCall?

    // MARK: - capture()

    @objc func capture(_ call: CAPPluginCall) {
        guard activeCapture == nil else {
            call.reject("A scan session is already active.", "ALREADY_ACTIVE")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available to present the camera.", "NO_PRESENTER")
                return
            }

            let controller = ScanCaptureController()
            controller.modalPresentationStyle = .fullScreen
            self.activeCapture = controller
            self.pendingCaptureCall = call

            controller.onFirstCapture = { [weak self] image in
                self?.deliverFirstCapture(image, resolving: call)
            }
            controller.onAdditionalCapture = { [weak self] image in
                self?.deliverAdditionalCapture(image)
            }
            controller.onDismiss = { [weak self, weak controller] in
                guard let self else { return }
                if let pending = self.pendingCaptureCall {
                    pending.reject("Scan cancelled.", "CANCELLED")
                    self.pendingCaptureCall = nil
                }
                self.activeCapture = nil
                controller?.dismiss(animated: true)
            }

            presenter.present(controller, animated: true)
        }
    }

    private func deliverFirstCapture(_ image: UIImage, resolving call: CAPPluginCall) {
        Task { [weak self] in
            guard let self else { return }
            let page = await ScanTextExtractor.extractSinglePage(from: image)
            guard let uri = self.writeTemporaryImage(image) else {
                call.reject("Failed to save the captured image.", "WRITE_FAILED")
                self.pendingCaptureCall = nil
                return
            }
            call.resolve([
                "imageUri": uri.absoluteString,
                "page": page.jsObject
            ])
            self.pendingCaptureCall = nil
        }
    }

    private func deliverAdditionalCapture(_ image: UIImage) {
        Task { [weak self] in
            guard let self, let uri = self.writeTemporaryImage(image) else { return }
            let page = await ScanTextExtractor.extractSinglePage(from: image)
            self.notifyListeners("pageCaptured", data: [
                "imageUri": uri.absoluteString,
                "page": page.jsObject
            ])
        }
    }

    /// Never base64-through-`resolve()` a full-resolution image (measurable
    /// JS-thread cost); write to `FileManager.temporaryDirectory` and hand
    /// back a `file://` URI, which JS loads via `Capacitor.convertFileSrc()`
    /// (contract §capture).
    private func writeTemporaryImage(_ image: UIImage) -> URL? {
        guard let data = image.jpegData(compressionQuality: 0.92) else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("jpg")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    // MARK: - extractPDF()

    @objc func extractPDF(_ call: CAPPluginCall) {
        guard let fileUriString = call.getString("fileUri"),
              let url = URL(string: fileUriString) else {
            call.reject("Missing or invalid fileUri.", "INVALID_ARGUMENT")
            return
        }
        Task {
            do {
                let document = try await ScanTextExtractor.extract(pdfAt: url)
                call.resolve(["pages": document.pages.map(\.jsObject)])
            } catch {
                // Per contract, "nothing readable found" is a valid empty
                // result, not a rejection — this reject path is reserved for
                // the PDF itself being unreadable (bad/missing file), which
                // is `ScanExtractionError.unreadableCapture` here.
                call.reject("Failed to extract text from the PDF.", "EXTRACTION_FAILED", error)
            }
        }
    }

    // MARK: - refineMerchant() / rescue() — optional, iOS 26+ only

    @objc func refineMerchant(_ call: CAPPluginCall) {
        guard let merchant = call.getString("merchant"), !merchant.isEmpty else {
            call.reject("Missing merchant.", "INVALID_ARGUMENT")
            return
        }
        Task {
            guard let refined = await ScanRefiner.refineMerchant(merchant) else {
                // Capacitor's bridge always resolves with a JSON object —
                // there is no `call.resolve(nil)`. Resolving empty is what
                // the TS wrapper (web/lib/scan/scanPlugin.ts) maps to the
                // contract's `null`, matching "resolves null immediately...
                // not an error" for the unavailable/timed-out/failed case
                // (FR-010, silent degrade).
                call.resolve()
                return
            }
            call.resolve(refined.jsObject)
        }
    }

    @objc func rescue(_ call: CAPPluginCall) {
        guard let pageObject = call.getObject("page") else {
            call.reject("Missing page.", "INVALID_ARGUMENT")
            return
        }
        let page = ScanDocumentText.Page(jsObject: Self.plainDictionary(pageObject))
        Task {
            guard let guess = await ScanRefiner.rescue(page) else {
                call.resolve() // see refineMerchant's note on the null convention
                return
            }
            call.resolve(guess.jsObject)
        }
    }

    /// Capacitor's `JSObject`/`JSArray` (`[String: JSValue]`/`[JSValue]`,
    /// where `JSValue` is an empty marker protocol) are distinct generic
    /// types from the plain `[String: Any]` this plugin's model-decoding
    /// initializers use elsewhere in `ScanTextExtractor.swift` (kept that way
    /// so those decoders have zero Capacitor dependency and stay easy to
    /// reason about in isolation). This walks a `JSObject` down into an
    /// ordinary `[String: Any]`/`[Any]` tree one level at a time.
    private static func plainDictionary(_ object: JSObject) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in object {
            result[key] = plainValue(value)
        }
        return result
    }

    private static func plainValue(_ value: JSValue) -> Any {
        if let nestedObject = value as? JSObject {
            return plainDictionary(nestedObject)
        }
        if let nestedArray = value as? JSArray {
            return nestedArray.map(plainValue)
        }
        return value
    }

    // MARK: - Permissions
    //
    // `CAPPlugin` already declares `checkPermissions`/`requestPermissions`
    // (the "Capacitor 3.0 permission pattern") — overriding them is the
    // whole implementation; there is no separate declarative permissions
    // list on iOS the way there is on Android (see the note atop this file).

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["camera": Self.permissionState(AVCaptureDevice.authorizationStatus(for: .video))])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in
            self?.checkPermissions(call)
        }
    }

    private static func permissionState(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized:
            return "granted"
        case .denied, .restricted:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }
}
