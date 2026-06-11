import SwiftUI

/// Curated household color palette. Used for user avatars and any owner-tinted
/// chrome. Do NOT extend with saturated colors — the system stays calm by
/// design. The first three keys mirror the legacy owner palette (peach for
/// Maya, slate for Jordan, sage for shared) so transactions keep their look.
struct OrthoColorOption: Identifiable, Hashable {
    let key: String
    let bg: Color
    let fg: Color
    var id: String { key }

    static let all: [OrthoColorOption] = [
        .init(key: "peach",      bg: Color(red: 0.949, green: 0.831, blue: 0.741),
                                 fg: Color(red: 0.478, green: 0.290, blue: 0.169)),
        .init(key: "slate",      bg: Color(red: 0.784, green: 0.831, blue: 0.886),
                                 fg: Color(red: 0.231, green: 0.310, blue: 0.416)),
        .init(key: "sage",       bg: Color(red: 0.812, green: 0.867, blue: 0.816),
                                 fg: Color(red: 0.247, green: 0.353, blue: 0.271)),
        .init(key: "terracotta", bg: Color(red: 0.910, green: 0.765, blue: 0.675),
                                 fg: Color(red: 0.478, green: 0.290, blue: 0.169)),
        .init(key: "mauve",      bg: Color(red: 0.851, green: 0.769, blue: 0.808),
                                 fg: Color(red: 0.353, green: 0.247, blue: 0.310)),
        .init(key: "sand",       bg: Color(red: 0.863, green: 0.816, blue: 0.722),
                                 fg: Color(red: 0.361, green: 0.310, blue: 0.208)),
    ]

    static func find(_ key: String) -> OrthoColorOption {
        all.first(where: { $0.key == key }) ?? all[0]
    }
}
