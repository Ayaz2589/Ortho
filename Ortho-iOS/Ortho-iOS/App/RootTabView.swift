import SwiftUI

/// Set by pushed detail views that want the custom `OrthoTabBar` to slide
/// away (e.g. property detail, household editor). `RootTabView` reads the
/// aggregated value via `.onPreferenceChange` and toggles the bar's
/// `safeAreaInset` content.
struct HideTabBarPreferenceKey: PreferenceKey {
    static let defaultValue: Bool = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        // OR-fold: any child that requests hiding wins.
        value = value || nextValue()
    }
}

extension View {
    /// Hide the global tab bar while this view is on-screen. Use on pushed
    /// detail screens that want the full vertical canvas.
    func hidesTabBar(_ hide: Bool = true) -> some View {
        preference(key: HideTabBarPreferenceKey.self, value: hide)
    }
}

enum OrthoTab: String, CaseIterable, Hashable, Identifiable {
    case dashboard, transactions, housing, settings

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .dashboard:    "Dashboard"
        case .transactions: "Transactions"
        case .housing:      "Housing"
        case .settings:     "Settings"
        }
    }

    /// SF Symbol for the tab. Outlined; selected state communicated by color.
    var symbol: String {
        switch self {
        case .dashboard:    "chart.bar"
        case .transactions: "arrow.up.arrow.down"
        case .housing:      "house"
        case .settings:     "gearshape"
        }
    }
}

/// Classic-iOS tab bar (option B from the design canvas). Flat surface with a
/// hairline above; icon + small label per tab.
struct OrthoTabBar: View {
    @Binding var selection: OrthoTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(OrthoTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 0)
        // Frosted-glass blur, softened — scrolling content shows through
        // more clearly than the default material. `.opacity(0.6)` dampens
        // the material's blur strength so the warm bg reads through.
        .background(.regularMaterial)
    }

    @ViewBuilder
    private func tabButton(_ tab: OrthoTab) -> some View {
        let isActive = tab == selection
        Button {
            selection = tab
        } label: {
            VStack(spacing: 3) {
                Image(systemName: tab.symbol)
                    .font(.lato(size: 22, weight: .regular))
                    .frame(height: 26)
                Text(tab.title)
                    .font(.lato(size: 10, weight: .medium))
                    .kerning(0.1)
                    .lineLimit(1)
            }
            .foregroundStyle(isActive ? AppTheme.text : AppTheme.text3)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.12), value: isActive)
    }
}

/// App shell. Owns tab selection; swaps body between Dashboard, Transactions,
/// and Settings. Reserves room for the bar via `safeAreaInset(.bottom)`.
struct RootTabView: View {
    @State private var selection: OrthoTab = .transactions
    @State private var tabBarHidden: Bool = false
    @Environment(AppState.self) private var appState

    var body: some View {
        // Use an explicit VStack to place the demo banner above the tab
        // body. Tried `.safeAreaInset(.top)` here originally, but the
        // child tabs (Housing / Settings) each have their own
        // `.safeAreaInset(.top)` for custom title bars — SwiftUI didn't
        // stack the nested insets cleanly and the banner ended up
        // overlapping the inner titles.
        VStack(spacing: 0) {
            #if DEBUG
            if appState.isInDemoMode {
                DemoModeBanner {
                    Task { await appState.exitDemoMode() }
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
            #endif

            // ZStack with an if-ladder shows one tab body at a time. A
            // page-style TabView would give horizontal-swipe paging
            // between tabs, but that adds a third pan-recognizer to the
            // stack (page-swipe vs. row swipeActions vs. List vertical
            // scroll) which UIKit cannot arbitrate without conflict. The
            // bottom OrthoTabBar is the only tab switcher.
            ZStack {
                switch selection {
                case .dashboard:    DashboardView()
                case .transactions: TransactionsView()
                case .housing:      HousingView()
                case .settings:     SettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.easeOut(duration: 0.18), value: selection)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !tabBarHidden {
                    OrthoTabBar(selection: $selection)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            // Keep the entire tab container (and therefore the bottom
            // safeAreaInset's tab bar) anchored to the screen bottom when
            // the keyboard appears. Without this, SwiftUI expands the bottom
            // safe area to include the keyboard height and pushes the tab
            // bar up above the keyboard — covering list rows. Matches the
            // standard UITabBarController behavior of letting the keyboard
            // cover the tab bar in place.
            .ignoresSafeArea(.keyboard, edges: .bottom)
        }
        .background(AppTheme.bg.ignoresSafeArea())
        .animation(.easeOut(duration: 0.22), value: appStateIsInDemoMode)
        .onPreferenceChange(HideTabBarPreferenceKey.self) { newValue in
            withAnimation(.easeOut(duration: 0.22)) {
                tabBarHidden = newValue
            }
        }
        .task {
            // Fetch live FX rates once per app launch when cache is stale.
            await appState.refreshRatesIfStale()
        }
    }

    /// Tracked so the VStack animates the banner in/out smoothly.
    private var appStateIsInDemoMode: Bool {
        #if DEBUG
        return appState.isInDemoMode
        #else
        return false
        #endif
    }
}

#Preview("Root · Light") {
    RootTabView()
        .environment(AppState())
        .preferredColorScheme(.light)
}

#Preview("Root · Dark") {
    RootTabView()
        .environment(AppState())
        .preferredColorScheme(.dark)
}
