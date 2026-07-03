// Custom camera for scanning (spec 014, revised post-T041 device feedback).
// Apple's VNDocumentCameraViewController auto-fired on ANY document-shaped
// rectangle — before the user had lined anything up — and exposes no shutter
// control. This AVFoundation replacement gates capture on what actually
// matters for the parse: READABLE TEXT in the live frames.
//   • the shutter button stays disabled until fast on-device OCR sees text
//     in two consecutive sampled frames (~0.7 s),
//   • auto-capture fires only after the scene stays readable for ~2.5 s,
//   • captured photos get the document-segmentation deskew VisionKit used
//     to provide, when Vision finds a confident quad.
// Trade-off vs the document camera: single capture per session (multi-page
// statements arrive via the PDF/file path). Photo-library and file sources
// stay SwiftUI-native on AddTransactionSheet.

import SwiftUI
import AVFoundation
import Vision
import CoreImage
import UIKit

struct ScanCameraView: View {
    /// One deskewed capture; the engine fires this at most once per session.
    let onCapture: (UIImage) -> Void
    let onCancel: () -> Void

    @State private var engine = ScanCameraEngine()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch engine.state {
            case .running:
                CameraPreviewView(session: engine.session)
                    .ignoresSafeArea()
            case .denied:
                fallbackMessage("Camera access is off. Allow camera access in Settings to scan.",
                                showsSettings: true)
            case .unavailable:
                fallbackMessage("Camera isn't available on this device.", showsSettings: false)
            case .checking:
                ProgressView().tint(.white)
            }

            VStack {
                HStack {
                    Button("Cancel", action: onCancel)
                        .font(.lato(size: 16))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                    Spacer()
                }
                Spacer()
                if engine.state == .running {
                    // Explicit LocalizedStringKey — a bare ternary of string
                    // literals would infer String and skip the catalog.
                    let hint: LocalizedStringKey = engine.isReady
                        ? "Ready to capture" : "Line up the receipt or statement"
                    Text(hint)
                        .font(.lato(size: 14))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(0.35)))
                        .padding(.bottom, 16)
                    shutterButton
                        .padding(.bottom, 36)
                }
            }
        }
        .task {
            engine.onImage = onCapture
            await engine.start()
        }
        .onDisappear { engine.stop() }
    }

    /// Disabled (dim) until live OCR confirms readable text — the gate the
    /// document camera never had.
    private var shutterButton: some View {
        Button {
            engine.capture()
        } label: {
            ZStack {
                Circle()
                    .stroke(.white.opacity(engine.isReady ? 0.95 : 0.35), lineWidth: 4)
                    .frame(width: 74, height: 74)
                Circle()
                    .fill(.white.opacity(engine.isReady ? 0.92 : 0.28))
                    .frame(width: 60, height: 60)
            }
        }
        .buttonStyle(.plain)
        .disabled(!engine.isReady)
        .accessibilityLabel("Capture")
        .animation(.easeOut(duration: 0.2), value: engine.isReady)
    }

    private func fallbackMessage(_ text: LocalizedStringKey, showsSettings: Bool) -> some View {
        VStack(spacing: 16) {
            Text(text)
                .font(.lato(size: 15))
                .foregroundStyle(.white.opacity(0.85))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            if showsSettings {
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text("Open Settings")
                        .font(.lato(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(.white.opacity(0.16)))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Engine (MainActor state over an off-main capture core)

@Observable
final class ScanCameraEngine {
    enum State: Equatable {
        case checking, denied, unavailable, running
    }

    private(set) var state: State = .checking
    private(set) var isReady = false
    var session: AVCaptureSession { core.session }
    /// Fired at most once, on the main actor, with the deskewed capture.
    var onImage: ((UIImage) -> Void)?

    private let core = CameraCore()
    private var readyStreak = 0
    private var missStreak = 0
    private var readySince: TimeInterval?
    private var captured = false

    func start() async {
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
        core.onTextPresence = { [weak self] present in
            Task { @MainActor [weak self] in self?.registerTextPresence(present) }
        }
        core.onPhoto = { [weak self] image in
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let image else {
                    self.captured = false // capture failed — allow retry
                    return
                }
                self.onImage?(image)
            }
        }
        let started = await core.configureAndStart()
        state = started ? .running : .unavailable
    }

    func stop() {
        core.stop()
    }

    func capture() {
        guard state == .running, !captured else { return }
        captured = true
        core.capturePhoto()
    }

    /// Hysteresis over the per-frame text signal: two consecutive readable
    /// frames arm the shutter, two misses disarm it. Auto-capture only after
    /// the scene has STAYED readable ~2.5 s — "wait until it has a clear
    /// shot and can read the data", never an instant snap.
    private func registerTextPresence(_ present: Bool) {
        guard state == .running, !captured else { return }
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
}

// MARK: - Capture core (session, sampling, photo) — all state on `queue`

/// Owns everything AVFoundation. Mutation happens only on the serial capture
/// queue (delegate callbacks land there too) — hence @unchecked Sendable.
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
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
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

// MARK: - Preview layer

private struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}
