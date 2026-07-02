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
    //
    // DEBUG `-uiDemo` launch argument: boot straight into the tab shell on
    // the sample-seeded AppState, skipping auth and all server traffic.
    // Exists for CI simulator screenshots (see .github/workflows/ios-ci.yml)
    // and quick local UI review; compiled out of release builds.
    @State private var appState: AppState = Self.isUIDemo
        ? AppState()
        : AppState(
            users: [], transactions: [], cards: [],
            households: [], properties: [], rentalPayments: [], budgets: []
        )

    private static var isUIDemo: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-uiDemo")
        #else
        false
        #endif
    }

    // DEBUG `-uiDemoLanguage <code>` launch argument: force the app language
    // for the session (accepts AppLanguage raw values plus "zh-Hans"), so CI
    // can screenshot every localization without touching @AppStorage. Rides
    // the same environment-locale path as the in-app language picker.
    private static var uiDemoLanguage: AppLanguage? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-uiDemoLanguage"), i + 1 < args.count else { return nil }
        let code = args[i + 1]
        return AppLanguage(rawValue: code == "zh-Hans" ? "zh" : code)
        #else
        return nil
        #endif
    }
    @AppStorage("appearance") private var appearanceRaw: String = AppearanceMode.system.rawValue
    @AppStorage("language") private var languageRaw: String = AppLanguage.system.rawValue

    init() {
        AppFont.register()
        // -uiDemoLanguage must reach Localizer BEFORE the first render:
        // imperative formatters and tr() lookups (insights, date group
        // headers, "None set") bake their output at first render, and in
        // demo mode `languageRaw` never changes, so the `.task(id:)` below
        // would set the locale too late with nothing left to re-render.
        // Real users are unaffected — their language CHANGES re-fire the
        // task and @AppStorage invalidates every view.
        if let demoLocale = Self.uiDemoLanguage?.locale {
            Localizer.currentLocale = demoLocale
        }
    }

    private var appearance: AppearanceMode {
        AppearanceMode(rawValue: appearanceRaw) ?? .system
    }

    private var language: AppLanguage {
        Self.uiDemoLanguage ?? AppLanguage(rawValue: languageRaw) ?? .system
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
                if Self.isUIDemo {
                    RootTabView()
                } else {
                switch appState.authPhase {
                case .launching:
                    LaunchView()
                case .signedIn:
                    if appState.bootstrapDidFail {
                        // Bootstrap left us signed-in with no usable household —
                        // offer an explicit, non-alarmist Retry instead of an
                        // empty, half-broken tab shell.
                        BootstrapRecoveryView()
                    } else {
                        RootTabView()
                    }
                case .signedOut:
                    SignInView()
                }
                }
            }
            .environment(appState)
            .environment(\.locale, effectiveLocale)
            .preferredColorScheme(appearance.colorScheme)
            .task {
                // First emission carries the SDK's restored session (or
                // nil), so this doubles as launch-time session restore.
                // Skipped in UI-demo mode — the sample state must not be
                // replaced by a real (empty) session.
                if Self.isUIDemo { return }
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
