import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

enum AppTheme {
    static let bg       = Color(light: Color(red: 0.969, green: 0.961, blue: 0.941),
                                dark:  Color(red: 0.055, green: 0.055, blue: 0.047))
    static let surface  = Color(light: .white,
                                dark:  Color(red: 0.102, green: 0.098, blue: 0.086))
    static let text     = Color(light: Color(red: 0.102, green: 0.094, blue: 0.082),
                                dark:  Color(red: 0.949, green: 0.937, blue: 0.910))
    static let positive = Color(light: Color(red: 0.369, green: 0.494, blue: 0.357),
                                dark:  Color(red: 0.651, green: 0.769, blue: 0.643))
    static let accent   = Color(light: Color(red: 0.549, green: 0.478, blue: 0.361),
                                dark:  Color(red: 0.788, green: 0.722, blue: 0.604))
    /// Muted brick red for destructive actions (Delete). Avoids the loud
    /// system red while still reading as a warning against the warm bg.
    static let destructive = Color(light: Color(red: 0.682, green: 0.318, blue: 0.290),
                                   dark:  Color(red: 0.855, green: 0.545, blue: 0.510))

    static var text2:    Color { text.opacity(0.58) }
    static var text3:    Color { text.opacity(0.36) }
    static var hairline: Color { text.opacity(0.07) }
}

extension Color {
    init(light: Color, dark: Color) {
        #if canImport(UIKit)
        self = Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #else
        self = light
        #endif
    }
}
