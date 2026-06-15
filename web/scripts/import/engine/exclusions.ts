// Codified non-spending classifier. Matched rows are flagged excluded by default
// (still shown in review, re-includable). Tested against the raw description so
// transfer/payment metadata is visible. Mirrors the old hardcoded importer.

interface ExclusionRule {
  pattern: RegExp
  reason: string
}

const RULES: ExclusionRule[] = [
  // Credit-card bill payments — the underlying charges live on those cards.
  { pattern: /AMEX EPAYMENT|APPLECARD|CHASE CREDIT CRD|CREDIT CRD AUTOPAY|GSBANK PAYMENT/, reason: 'cc-payment' },
  // Investment transfers — not spending.
  { pattern: /WEALTHFRONT/, reason: 'investment' },
  // Internal account transfers (savings, Money Line, etc.).
  { pattern: /TRANSFER TO (?:SV|SAVINGS|ML)|TRANSFER FROM (?:SV|SAVINGS|ML)|DDA TRNSFR|DDA TRANSFER/, reason: 'internal-transfer' },
]

/** Classify whether a row is non-spending (default-excluded) and why. */
export function classifyExclusion(rawDescription: string): {
  excluded: boolean
  reason: string | null
} {
  const upper = rawDescription.toUpperCase()
  for (const rule of RULES) {
    if (rule.pattern.test(upper)) return { excluded: true, reason: rule.reason }
  }
  return { excluded: false, reason: null }
}
