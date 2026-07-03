// Apple's document camera wrapped for SwiftUI (spec 014, research R1).
// Edge detection, perspective correction, and multi-page capture come from
// VisionKit; we only receive the corrected page images. Photo-library and
// file sources are SwiftUI-native (.photosPicker / .fileImporter) and live
// on AddTransactionSheet directly — only the camera needs a representable.

import SwiftUI
import VisionKit

struct DocumentCameraView: UIViewControllerRepresentable {
    /// Corrected page images, in capture order.
    let onScan: ([UIImage]) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan, onCancel: onCancel)
    }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onScan: ([UIImage]) -> Void
        let onCancel: () -> Void

        init(onScan: @escaping ([UIImage]) -> Void, onCancel: @escaping () -> Void) {
            self.onScan = onScan
            self.onCancel = onCancel
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFinishWith scan: VNDocumentCameraScan) {
            let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            onScan(images)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFailWithError error: Error) {
            // Same UX as cancel — the form stays untouched; the user can
            // retry from the Scan menu (no error red, FR-017 spirit).
            onCancel()
        }
    }
}
