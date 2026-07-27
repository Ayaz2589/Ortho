// spec 032 — import orchestration.
//
// planImport is PURE (no writes): it reads each section, runs the section's
// two-tier dedup against the store, and returns the per-section counts that
// drive the preview shown BEFORE the user confirms. applyImport runs only after
// confirmation and performs ONLY additive creates for `plan.add`. Never deletes
// or overwrites. Re-importing the same file adds nothing (idempotent).

import './sections' // ensure built-in sections are registered
import type { ExportEnvelope } from './envelope'
import { getSection, type ApplyCtx, type DataStore, type SectionDedupePlan } from './registry'

export interface SectionImportSummary {
  key: string
  /** false → this build doesn't know the section; it was skipped. */
  known: boolean
  added: number
  skippedById: number
  skippedByContent: number
}

export interface ImportResult {
  ok: boolean
  fileLabel: string
  sections: SectionImportSummary[]
}

/** One section's dedup plan carried alongside its key for the apply phase. */
export interface SectionPlan {
  key: string
  plan: SectionDedupePlan
}

export interface ImportPlan {
  result: ImportResult
  /** Plans for known sections only, in envelope order. */
  plans: SectionPlan[]
}

/**
 * Read + dedup every section against the store. Pure — no writes. Unknown
 * section keys are surfaced as `known: false` (skipped), never fatal.
 */
export function planImport(envelope: ExportEnvelope, store: DataStore): ImportPlan {
  const sections: SectionImportSummary[] = []
  const plans: SectionPlan[] = []

  for (const payload of envelope.sections) {
    const section = getSection(payload.key)
    if (!section) {
      sections.push({ key: payload.key, known: false, added: 0, skippedById: 0, skippedByContent: 0 })
      continue
    }
    const records = section.read(payload)
    const plan = section.dedupe(records, store)
    plans.push({ key: payload.key, plan })
    sections.push({
      key: payload.key,
      known: true,
      added: plan.add.length,
      skippedById: plan.skipById.length,
      skippedByContent: plan.skipByContent.length,
    })
  }

  const dateLabel = envelope.generatedAt?.slice(0, 10) ?? ''
  return {
    result: {
      ok: true,
      fileLabel: [envelope.household?.name, dateLabel].filter(Boolean).join(' · '),
      sections,
    },
    plans,
  }
}

/**
 * Apply the planned adds via each section's additive store mutations. Runs only
 * for known sections. `ctx.now` stamps created records deterministically.
 */
export function applyImport(plans: SectionPlan[], store: DataStore, ctx: ApplyCtx): void {
  for (const { key, plan } of plans) {
    const section = getSection(key)
    if (!section) continue
    section.apply(plan, store, ctx)
  }
}
