// spec 032 — the machine-readable payload embedded inside the exported PDF.
//
// The envelope is the AUTHORITATIVE source for re-import; the visible PDF pages
// are a human-readable presentation only. Amounts inside section records are
// ALWAYS canonical USD integer cents — the display currency/language chosen at
// export never touches them, so re-import is lossless and currency-independent.

import type { CurrencyKey } from '../finance/money'
import type { Language } from '../language'

/** Bump when the envelope shape changes incompatibly. `validate` rejects files
 *  whose `formatVersion` is newer than this build understands. */
export const SUPPORTED_FORMAT_VERSION = 1

/** Name + mime of the embedded JSON attachment (pdf-lib `attach`). */
export const ATTACHMENT_NAME = 'ortho-export.json'
export const ATTACHMENT_MIME = 'application/json'

/** App marker so a random PDF is never mistaken for an Ortho data file. */
export const APP_NAME = 'ortho'

/** One section's serialized payload. `records` are section-specific (see the
 *  section modules). `sectionVersion` is independent of `formatVersion` so a
 *  single section can evolve without a whole-file version bump. */
export interface SectionPayload {
  key: string
  sectionVersion: number
  records: unknown[]
}

export interface ExportEnvelope {
  formatVersion: number
  /** ISO timestamp. Injected by the caller — never `Date.now()` in pure code. */
  generatedAt: string
  app: { name: typeof APP_NAME; version: string }
  household: { id: string; name: string }
  /** Provenance of the VISIBLE layer only. Ignored entirely on import. */
  display: { language: Language; currency: CurrencyKey }
  sections: SectionPayload[]
}

export type ValidateReason = 'not-ortho-file' | 'unsupported-version' | 'corrupt'

export type ValidateResult =
  | { ok: true; envelope: ExportEnvelope }
  | { ok: false; reason: ValidateReason }

/**
 * Validate arbitrary parsed JSON as a supported Ortho export envelope.
 * Pure — performs no I/O and no writes. Returns a typed reason on every
 * failure path so the importer can make zero changes and explain why.
 */
export function validateEnvelope(input: unknown): ValidateResult {
  if (input === null || typeof input !== 'object') return { ok: false, reason: 'corrupt' }
  const env = input as Partial<ExportEnvelope>

  // App marker first: a well-formed but foreign JSON is "not an Ortho file",
  // which reads better to the user than "corrupt".
  if (!env.app || typeof env.app !== 'object' || env.app.name !== APP_NAME) {
    return { ok: false, reason: 'not-ortho-file' }
  }
  if (typeof env.formatVersion !== 'number' || !Number.isFinite(env.formatVersion)) {
    return { ok: false, reason: 'corrupt' }
  }
  if (env.formatVersion > SUPPORTED_FORMAT_VERSION || env.formatVersion < 1) {
    return { ok: false, reason: 'unsupported-version' }
  }
  if (!Array.isArray(env.sections)) return { ok: false, reason: 'corrupt' }
  // Unknown section keys are tolerated (skipped on import) — not a validation
  // failure. Only the envelope-level shape is checked here.
  for (const s of env.sections) {
    if (!s || typeof s !== 'object' || typeof (s as SectionPayload).key !== 'string') {
      return { ok: false, reason: 'corrupt' }
    }
    if (!Array.isArray((s as SectionPayload).records)) return { ok: false, reason: 'corrupt' }
  }
  return { ok: true, envelope: env as ExportEnvelope }
}
