import SwiftUI

/// Renders the prioritized list of recommendations from `InsightEngine`.
/// Hides itself entirely when the engine returns no insights — keeps the
/// Dashboard clean for fresh accounts with no data yet.
///
/// Surface-level wrapper: this view does no math. Engine call is cheap
/// (pure functions over already-in-memory arrays), so no caching for v1.
struct InsightsCardStack: View {
    @Environment(AppState.self) private var appState

    private var insights: [Insight] {
        InsightEngine.recommendations(
            transactions: appState.transactions,
            budgets: appState.budgets,
            properties: appState.properties
        )
    }

    var body: some View {
        if insights.isEmpty {
            EmptyView()
        } else {
            VStack(spacing: 8) {
                ForEach(insights) { insight in
                    InsightCard(insight: insight)
                }
            }
        }
    }
}
