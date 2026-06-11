import SwiftUI

/// Visual treatment for a single `Insight`. Severity drives the icon tint
/// and a left accent strip; the rest mirrors the Dashboard widget grammar
/// (surface background, 14pt corner radius, 13pt label / 16pt body copy).
struct InsightCard: View {
    let insight: Insight

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Severity accent strip
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(insight.severity.tint)
                .frame(width: 3)

            // Icon tile
            ZStack {
                Circle()
                    .fill(insight.severity.tint.opacity(0.12))
                    .frame(width: 36, height: 36)
                Image(systemName: insight.icon)
                    .font(.lato(size: 15, weight: .semibold))
                    .foregroundStyle(insight.severity.tint)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(insight.title)
                    .font(.lato(size: 15, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(AppTheme.text)
                Text(insight.body)
                    .font(.lato(size: 13))
                    .foregroundStyle(AppTheme.text2)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14)
        .padding(.trailing, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

#Preview("InsightCard · severities") {
    VStack(spacing: 12) {
        InsightCard(insight: Insight(
            id: "preview-1",
            title: "Over budget on Dining",
            body: "You're $45.00 over your $400.00 limit with 12 days left.",
            severity: .critical,
            icon: "exclamationmark.triangle.fill",
            category: .dining,
            magnitudeCents: 4500
        ))
        InsightCard(insight: Insight(
            id: "preview-2",
            title: "Coffee up 38% vs last month",
            body: "$58.00 → $80.00.",
            severity: .warning,
            icon: "arrow.up.right",
            category: .coffee,
            magnitudeCents: 2200
        ))
        InsightCard(insight: Insight(
            id: "preview-3",
            title: "Dining is your top category",
            body: "$420.00 this month — 32% of total spend.",
            severity: .info,
            icon: "fork.knife",
            category: .dining,
            magnitudeCents: 42000
        ))
        InsightCard(insight: Insight(
            id: "preview-4",
            title: "Saving 23% of income",
            body: "Net $1,250.00 saved this month — well above the 20% benchmark.",
            severity: .positive,
            icon: "leaf.fill",
            category: nil,
            magnitudeCents: 125000
        ))
    }
    .padding(16)
    .background(AppTheme.bg)
}
