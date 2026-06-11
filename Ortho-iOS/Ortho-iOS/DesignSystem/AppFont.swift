import SwiftUI
import CoreText

/// Lato (Google Fonts) as the app's typography. Four bundled weights:
/// Light (300), Regular (400), Bold (700), Black (900). SF Pro weights
/// without exact Lato matches (medium / semibold) map up to Bold so
/// emphasis still reads, at the cost of one less weight tier of nuance.
///
/// Files live in `Ortho-iOS/Fonts/` and are auto-included in the bundle
/// via the project's `PBXFileSystemSynchronizedRootGroup`. They are
/// registered at runtime by `AppFont.register()` (called from
/// `Ortho_iOSApp.init()`) — avoids needing a hand-rolled Info.plist for
/// `UIAppFonts` (no `INFOPLIST_KEY_UIAppFonts` build-setting alias
/// exists for the array-shaped key).
enum AppFont {
    private static let fileNames = [
        "Lato-Light",
        "Lato-Regular",
        "Lato-Bold",
        "Lato-Black",
    ]

    /// Call once at app launch. Idempotent — Core Text ignores re-registration.
    static func register() {
        for name in fileNames {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else {
                #if DEBUG
                print("[AppFont] missing font file: \(name).ttf")
                #endif
                continue
            }
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                #if DEBUG
                if let err = error?.takeRetainedValue() {
                    print("[AppFont] failed to register \(name): \(err)")
                }
                #endif
            }
        }
    }

    /// Size threshold that delimits "header" from body text. ≥ this size
    /// uses Lato-Light (300) per design; below uses Lato-Regular (400).
    /// Captures page titles (32pt), big-value displays (28–36pt), and the
    /// sign-in titles (24pt) on the header side; body / meta / micro on
    /// the regular side.
    fileprivate static let headerThreshold: CGFloat = 24

    fileprivate static func psName(for size: CGFloat) -> String {
        size >= headerThreshold ? "Lato-Light" : "Lato-Regular"
    }
}

extension Font {
    /// Drop-in replacement for `.system(size:weight:)`. The `weight:`
    /// parameter is accepted for call-site compatibility but ignored —
    /// the family is picked from size alone (header vs. body).
    static func lato(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        return .custom(AppFont.psName(for: size), size: size)
    }
}
