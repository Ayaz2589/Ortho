// Custom camera for scanning (spec 014, revised post-T041 device feedback;
// ported from SwiftUI to a plain UIViewController for this Capacitor plugin,
// spec 021). Apple's VNDocumentCameraViewController auto-fired on ANY
// document-shaped rectangle — before the user had lined anything up — and
// exposes no shutter control. This AVFoundation replacement gates capture on
// what actually matters for the parse: READABLE TEXT in the live frames.
//   • the shutter button stays disabled until fast on-device OCR sees text
//     in two consecutive sampled frames (~0.7 s),
//   • auto-capture fires only after the scene stays readable for ~2.5 s,
//   • captured photos get the document-segmentation deskew VisionKit used
//     to provide, when Vision finds a confident quad.
// The gating ALGORITHM (hysteresis constants, `cgOrientation(for:)` portrait
// handling, deskew) is ported verbatim from
// iOS/Ortho-iOS/Features/Transactions/Scan/ScanCaptureView.swift's
// `ScanCameraEngine`/`CameraCore`. What's NEW here (Capacitor plugins present
// UIKit, not SwiftUI, and the contract adds a multi-page statement flow the
// frozen app never had — see contracts/scan-plugin-api.md §Events):
//   • the SwiftUI `View`/`@Observable` engine becomes a single
//     `UIViewController` driving the same `CameraCore` capture core,
//   • the session can now stay open past the first photo: `onFirstCapture`
//     fulfills the plugin's `capture()` promise, and every photo after that
//     fires `onAdditionalCapture` instead (relayed by the plugin as
//     `pageCaptured` events) until the user taps Done/Cancel.
//
// Not compiled in this environment (no Xcode/macOS) — see the note atop
// ScanPlugin.swift. Build/behavior verification happens in CI.

import UIKit
import AVFoundation
import Vision
import CoreImage
import ImageIO

final class ScanCaptureController: UIViewController {

    enum State: Equatable {
        case checking, denied, unavailable, running
    }

    /// Fulfills the plugin's `capture()` promise (contract: "Resolves once,
    /// on a completed capture").
    var onFirstCapture: ((UIImage) -> Void)?
    /// Every capture after the first, while the session stays open for a
    /// multi-page statement scan; the plugin relays each as a `pageCaptured`
    /// event rather than a second promise resolution.
    var onAdditionalCapture: ((UIImage) -> Void)?
    /// User tapped Cancel (before any capture) or Done (after >=1 capture).
    /// The plugin distinguishes the two cases via whether it already
    /// resolved the call.
    var onDismiss: (() -> Void)?

    private(set) var state: State = .checking {
        didSet { updateChrome() }
    }
    private var isReady = false {
        didSet { updateShutterAppearance() }
    }
    private var hasCapturedAnyPage = false
    private var readyStreak = 0
    private var missStreak = 0
    private var readySince: TimeInterval?
    private var captureInFlight = false

    private let engine = CameraCore()

    // MARK: UI

    private let previewView = PreviewView()
    private let dismissButton = UIButton(type: .system)
    private let hintBackground = UIView()
    private let hintLabel = UILabel()
    private let shutterButton = UIButton(type: .custom)
    private let shutterOuterRing = UIView()
    private let shutterInnerDot = UIView()
    private let statusLabel = UILabel()
    private let settingsButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .large)

    override func viewDidLoad() {
        super.viewDidLoad()
        modalPresentationStyle = .fullScreen
        view.backgroundColor = .black
        buildUI()

        previewView.previewLayer.session = engine.session
        engine.onTextPresence = { [weak self] present in
            Task { @MainActor [weak self] in self?.registerTextPresence(present) }
        }
        engine.onPhoto = { [weak self] image in
            Task { @MainActor [weak self] in self?.handlePhoto(image) }
        }

        updateChrome()
        updateShutterAppearance()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Interface orientation (not device/gravity) drives the live-OCR
        // image orientation. Captured once when the camera opens; a
        // mid-session device rotation keeps the launch orientation (portrait
        // scanning is the norm, and the gate already works there).
        engine.setAnalysisOrientation(Self.cgOrientation(for: Self.currentInterfaceOrientation()))
        Task { await start() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        engine.stop()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        hintBackground.layer.cornerRadius = hintBackground.bounds.height / 2
    }

    // MARK: Session lifecycle

    private func start() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                state = .denied
                return
            }
        default:
            state = .denied
            return
        }
        let started = await engine.configureAndStart()
        state = started ? .running : .unavailable
    }

    // MARK: Capture gating — ported verbatim from ScanCameraEngine

    /// Hysteresis over the per-frame text signal: two consecutive readable
    /// frames arm the shutter, two misses disarm it. Auto-capture only after
    /// the scene has STAYED readable ~2.5 s — "wait until it has a clear
    /// shot and can read the data", never an instant snap.
    private func registerTextPresence(_ present: Bool) {
        guard state == .running, !captureInFlight else { return }
        if present {
            readyStreak += 1
            missStreak = 0
            if readyStreak >= 2, !isReady {
                isReady = true
                readySince = CFAbsoluteTimeGetCurrent()
            }
            if isReady, let since = readySince,
               CFAbsoluteTimeGetCurrent() - since >= 2.5 {
                capture()
            }
        } else {
            missStreak += 1
            readyStreak = 0
            if missStreak >= 2 {
                isReady = false
                readySince = nil
            }
        }
    }

    private func capture() {
        guard state == .running, !captureInFlight else { return }
        captureInFlight = true
        engine.capturePhoto()
    }

    private func handlePhoto(_ image: UIImage?) {
        captureInFlight = false
        guard let image else { return } // capture failed — allow retry
        if hasCapturedAnyPage {
            onAdditionalCapture?(image)
        } else {
            hasCapturedAnyPage = true
            onFirstCapture?(image)
            dismissButton.setTitle("Done", for: .normal)
        }
        // Re-arm the gate for the next page in this session.
        isReady = false
        readyStreak = 0
        missStreak = 0
        readySince = nil
    }

    /// Back-camera buffer orientation per interface orientation, so live
    /// `VNRecognizeText` reads upright text. Portrait -> `.right` is the case
    /// the shutter gate hinges on: the sensor delivers landscape-native
    /// buffers, so without this a portrait receipt's text is analyzed
    /// sideways, never hits two readable lines, and the shutter never arms.
    private static func cgOrientation(for interface: UIInterfaceOrientation) -> CGImagePropertyOrientation {
        switch interface {
        case .portrait:           return .right
        case .portraitUpsideDown: return .left
        case .landscapeLeft:      return .down
        case .landscapeRight:     return .up
        default:                  return .right
        }
    }

    @MainActor
    private static func currentInterfaceOrientation() -> UIInterfaceOrientation {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.interfaceOrientation ?? .portrait
    }

    // MARK: Actions

    @objc private func shutterTapped() {
        capture()
    }

    @objc private func dismissTapped() {
        onDismiss?()
    }

    @objc private func settingsTapped() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: Chrome

    private func updateChrome() {
        previewView.isHidden = state != .running
        hintBackground.isHidden = state != .running
        shutterButton.isHidden = state != .running
        if state == .checking {
            spinner.startAnimating()
        } else {
            spinner.stopAnimating()
        }
        switch state {
        case .denied:
            statusLabel.text = "Camera access is off. Allow camera access in Settings to scan."
            statusLabel.isHidden = false
            settingsButton.isHidden = false
        case .unavailable:
            statusLabel.text = "Camera isn't available on this device."
            statusLabel.isHidden = false
            settingsButton.isHidden = true
        case .checking, .running:
            statusLabel.isHidden = true
            settingsButton.isHidden = true
        }
    }

    private func updateShutterAppearance() {
        hintLabel.text = isReady ? "Ready to capture" : "Line up the receipt or statement"
        shutterButton.isEnabled = isReady
        UIView.animate(withDuration: 0.2) {
            self.shutterOuterRing.layer.borderColor =
                UIColor.white.withAlphaComponent(self.isReady ? 0.95 : 0.35).cgColor
            self.shutterInnerDot.backgroundColor =
                UIColor.white.withAlphaComponent(self.isReady ? 0.92 : 0.28)
        }
    }

    // MARK: Layout

    private func buildUI() {
        previewView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(previewView)

        var dismissConfig = UIButton.Configuration.plain()
        dismissConfig.title = "Cancel"
        dismissConfig.baseForegroundColor = .white
        dismissConfig.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
        dismissButton.configuration = dismissConfig
        dismissButton.addTarget(self, action: #selector(dismissTapped), for: .touchUpInside)
        dismissButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(dismissButton)

        hintLabel.font = .systemFont(ofSize: 14)
        hintLabel.textColor = UIColor.white.withAlphaComponent(0.85)
        hintLabel.textAlignment = .center
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        hintBackground.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        hintBackground.translatesAutoresizingMaskIntoConstraints = false
        hintBackground.addSubview(hintLabel)
        view.addSubview(hintBackground)

        shutterOuterRing.isUserInteractionEnabled = false
        shutterOuterRing.layer.cornerRadius = 37
        shutterOuterRing.layer.borderWidth = 4
        shutterOuterRing.layer.borderColor = UIColor.white.withAlphaComponent(0.35).cgColor
        shutterOuterRing.translatesAutoresizingMaskIntoConstraints = false

        shutterInnerDot.isUserInteractionEnabled = false
        shutterInnerDot.layer.cornerRadius = 30
        shutterInnerDot.backgroundColor = UIColor.white.withAlphaComponent(0.28)
        shutterInnerDot.translatesAutoresizingMaskIntoConstraints = false

        shutterButton.accessibilityLabel = "Capture"
        shutterButton.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)
        shutterButton.addSubview(shutterOuterRing)
        shutterButton.addSubview(shutterInnerDot)
        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(shutterButton)

        statusLabel.font = .systemFont(ofSize: 15)
        statusLabel.textColor = UIColor.white.withAlphaComponent(0.85)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        var settingsConfig = UIButton.Configuration.filled()
        settingsConfig.title = "Open Settings"
        settingsConfig.baseBackgroundColor = UIColor.white.withAlphaComponent(0.16)
        settingsConfig.baseForegroundColor = .white
        settingsConfig.cornerStyle = .capsule
        settingsConfig.contentInsets = NSDirectionalEdgeInsets(top: 9, leading: 18, bottom: 9, trailing: 18)
        settingsButton.configuration = settingsConfig
        settingsButton.addTarget(self, action: #selector(settingsTapped), for: .touchUpInside)
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(settingsButton)

        spinner.color = .white
        spinner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(spinner)

        let safeArea = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            previewView.topAnchor.constraint(equalTo: view.topAnchor),
            previewView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            previewView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            dismissButton.topAnchor.constraint(equalTo: safeArea.topAnchor),
            dismissButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),

            shutterButton.widthAnchor.constraint(equalToConstant: 74),
            shutterButton.heightAnchor.constraint(equalToConstant: 74),
            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -36),

            shutterOuterRing.widthAnchor.constraint(equalToConstant: 74),
            shutterOuterRing.heightAnchor.constraint(equalToConstant: 74),
            shutterOuterRing.centerXAnchor.constraint(equalTo: shutterButton.centerXAnchor),
            shutterOuterRing.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            shutterInnerDot.widthAnchor.constraint(equalToConstant: 60),
            shutterInnerDot.heightAnchor.constraint(equalToConstant: 60),
            shutterInnerDot.centerXAnchor.constraint(equalTo: shutterButton.centerXAnchor),
            shutterInnerDot.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),

            hintBackground.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintBackground.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -16),
            hintLabel.topAnchor.constraint(equalTo: hintBackground.topAnchor, constant: 6),
            hintLabel.bottomAnchor.constraint(equalTo: hintBackground.bottomAnchor, constant: -6),
            hintLabel.leadingAnchor.constraint(equalTo: hintBackground.leadingAnchor, constant: 14),
            hintLabel.trailingAnchor.constraint(equalTo: hintBackground.trailingAnchor, constant: -14),

            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40),
            settingsButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16),
            settingsButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
}

// MARK: - Preview layer

private final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }

    override init(frame: CGRect) {
        super.init(frame: frame)
        previewLayer.videoGravity = .resizeAspectFill
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        previewLayer.videoGravity = .resizeAspectFill
    }
}

// MARK: - Capture core (session, sampling, photo) — all state on `queue`
//
// Ported verbatim from ScanCaptureView.swift's `CameraCore`. Owns everything
// AVFoundation. Mutation happens only on the serial capture queue (delegate
// callbacks land there too) — hence @unchecked Sendable.

private nonisolated final class CameraCore: NSObject,
    AVCaptureVideoDataOutputSampleBufferDelegate,
    AVCapturePhotoCaptureDelegate,
    @unchecked Sendable {

    let session = AVCaptureSession()
    var onTextPresence: (@Sendable (Bool) -> Void)?
    /// Called on the capture queue with the deskewed image (nil = failure).
    var onPhoto: (@Sendable (UIImage?) -> Void)?

    private let queue = DispatchQueue(label: "ortho.scan.camera")
    private let videoOutput = AVCaptureVideoDataOutput()
    private let photoOutput = AVCapturePhotoOutput()
    private var lastAnalysis: TimeInterval = 0
    /// Orientation of the live sample buffers for OCR. Set from the main
    /// actor (interface orientation), read on `queue`. Defaults to
    /// portrait's `.right` so the shutter can arm before the first
    /// orientation update lands.
    private var analysisOrientation: CGImagePropertyOrientation = .right

    /// False when no camera input can be attached (simulator).
    func configureAndStart() async -> Bool {
        await withCheckedContinuation { continuation in
            queue.async {
                guard let device = AVCaptureDevice.default(for: .video),
                      let input = try? AVCaptureDeviceInput(device: device) else {
                    continuation.resume(returning: false)
                    return
                }
                self.session.beginConfiguration()
                self.session.sessionPreset = .photo
                if self.session.canAddInput(input) { self.session.addInput(input) }
                self.videoOutput.alwaysDiscardsLateVideoFrames = true
                self.videoOutput.setSampleBufferDelegate(self, queue: self.queue)
                if self.session.canAddOutput(self.videoOutput) { self.session.addOutput(self.videoOutput) }
                if self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
                self.session.commitConfiguration()
                self.session.startRunning()
                continuation.resume(returning: true)
            }
        }
    }

    func stop() {
        queue.async { self.session.stopRunning() }
    }

    /// Serialized onto `queue` so the sample-buffer delegate reads a
    /// consistent value. `CGImagePropertyOrientation` is Sendable.
    func setAnalysisOrientation(_ orientation: CGImagePropertyOrientation) {
        queue.async { self.analysisOrientation = orientation }
    }

    func capturePhoto() {
        queue.async {
            self.photoOutput.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }

    // MARK: Live-frame text check (~3/s, fast recognizer, on the queue)

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastAnalysis >= 0.35,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastAnalysis = now
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        request.usesLanguageCorrection = false
        // Orient the sensor-native (landscape) buffer to upright, or the
        // recognizer reads a portrait receipt's text sideways and finds nothing.
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer,
                                            orientation: analysisOrientation,
                                            options: [:])
        try? handler.perform([request])
        let readableLines = (request.results ?? []).filter { $0.confidence >= 0.3 }.count
        onTextPresence?(readableLines >= 2)
    }

    // MARK: Photo delivery (deskewed on the queue, never on main)

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard error == nil,
              let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:)) else {
            onPhoto?(nil)
            return
        }
        onPhoto?(Self.deskewed(Self.orientationNormalized(image)))
    }

    /// The perspective correction VisionKit's document camera provided:
    /// crop to the detected document quad when Vision is confident,
    /// otherwise return the frame untouched.
    private static func deskewed(_ image: UIImage) -> UIImage {
        guard let cgImage = image.cgImage else { return image }
        let request = VNDetectDocumentSegmentationRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        guard (try? handler.perform([request])) != nil,
              let quad = request.results?.first,
              quad.confidence >= 0.5 else { return image }
        let ciImage = CIImage(cgImage: cgImage)
        let size = ciImage.extent.size
        func point(_ p: CGPoint) -> CIVector {
            CIVector(x: p.x * size.width, y: p.y * size.height)
        }
        guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return image }
        filter.setValue(ciImage, forKey: kCIInputImageKey)
        filter.setValue(point(quad.topLeft), forKey: "inputTopLeft")
        filter.setValue(point(quad.topRight), forKey: "inputTopRight")
        filter.setValue(point(quad.bottomLeft), forKey: "inputBottomLeft")
        filter.setValue(point(quad.bottomRight), forKey: "inputBottomRight")
        guard let output = filter.outputImage,
              let corrected = CIContext().createCGImage(output, from: output.extent) else { return image }
        return UIImage(cgImage: corrected)
    }

    /// Bake the EXIF orientation into pixels so the segmentation quad and
    /// the downstream OCR see the image upright.
    private static func orientationNormalized(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let renderer = UIGraphicsImageRenderer(size: image.size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}
