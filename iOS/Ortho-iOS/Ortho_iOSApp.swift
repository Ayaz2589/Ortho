//
//  Ortho_iOSApp.swift
//  Ortho-iOS
//
//  Created by Ayaz Uddin on 5/18/26.
//

import SwiftUI

@main
struct Ortho_iOSApp: App {
    // Start empty — the app holds no seeded/sample data. Every domain
    // collection is populated only from Supabase once the user signs in
    // (see `bootstrapUserSession` / `loadAllFromServer`).
    @State private var appState = AppState(
        users: [], transactions: [], cards: [],
        households: [], properties: [], rentalPayments: [], budgets: []
    )
    @AppStorage("appearance") private var appearanceRaw: String = AppearanceMode.system.rawValue
    @AppStorage("language") private var languageRaw: String = AppLanguage.system.rawValue
    @Environment(\.scenePhase) private var scenePhase

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
                switch appState.authPhase {
                case .launching: LaunchView()
                case .signedIn:  RootTabView()
                case .signedOut: SignInView()
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
            .onChange(of: scenePhase) { _, phase in
                // On foreground, yield the single-active-platform lock if web
                // has taken it since we claimed it.
                if phase == .active {
                    Task { await appState.checkPlatformLockYield() }
                }
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
