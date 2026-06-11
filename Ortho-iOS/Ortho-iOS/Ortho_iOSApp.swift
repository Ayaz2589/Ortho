//
//  Ortho_iOSApp.swift
//  Ortho-iOS
//
//  Created by Ayaz Uddin on 5/18/26.
//

import SwiftUI

@main
struct Ortho_iOSApp: App {
    @State private var appState = AppState()
    @AppStorage("appearance") private var appearanceRaw: String = AppearanceMode.system.rawValue
    @AppStorage("language") private var languageRaw: String = AppLanguage.system.rawValue

    init() {
        AppFont.register()
    }

    private var appearance: AppearanceMode {
        AppearanceMode(rawValue: appearanceRaw) ?? .system
    }

    private var language: AppLanguage {
        AppLanguage(rawValue: languageRaw) ?? .system
    }

    /// Effective locale = explicit choice if set, otherwise track the OS.
    /// Pushed both into SwiftUI's environment (reaches `Text`, `.formatted`)
    /// AND into `Localizer.currentLocale` (reaches imperative formatters
    /// in non-view code: Money, InsightEngine, TransactionGroup).
    private var effectiveLocale: Locale {
        language.locale ?? .autoupdatingCurrent
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.session != nil {
                    RootTabView()
                } else {
                    SignInView()
                }
            }
            .environment(appState)
            .environment(\.locale, effectiveLocale)
            .preferredColorScheme(appearance.colorScheme)
            .task {
                // First emission carries the SDK's restored session (or
                // nil), so this doubles as launch-time session restore.
                await appState.observeAuthChanges()
            }
            .task(id: languageRaw) {
                // Mirror the environment locale into Localizer for any
                // non-view formatters (cached statics, model computed-vars,
                // InsightEngine). Fires once on launch (`languageRaw` has
                // its initial value) and again on every language change.
                Localizer.currentLocale = effectiveLocale
            }
        }
    }
}
