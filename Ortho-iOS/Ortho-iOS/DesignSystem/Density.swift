import SwiftUI

enum Density {
    case comfortable, compact

    var rowMinHeight: CGFloat { self == .compact ? 56 : 72 }
    var pad:          CGFloat { self == .compact ? 14 : 16 }
    var titleSize:    CGFloat { self == .compact ? 15 : 17 }
    var metaSize:     CGFloat { self == .compact ? 12 : 13 }
    var amountSize:   CGFloat { self == .compact ? 16 : 18 }
    var avatar:       CGFloat { self == .compact ? 32 : 38 }
}
