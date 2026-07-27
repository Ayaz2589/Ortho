// spec 032 — export orchestration: store → envelope + visible pages → PDF bytes.
//
// Amounts in the envelope are ALWAYS canonical USD cents; the chosen language +
// currency only shape the visible layer (via RenderCtx + the PDF-safe money
// formatter). Import ignores `display` entirely, so the file round-trips
// losslessly regardless of the currency picked here.

import './sections' // ensure built-in sections are registered
import type { CurrencyKey } from '../finance/money'
import { localeForLanguage, type Language } from '../language'
import { APP_NAME, SUPPORTED_FORMAT_VERSION, type ExportEnvelope, type SectionPayload } from './envelope'
import { loadFontForLanguage } from './pdf/fonts'
import { buildPdf } from './pdf/generate'
import { formatMoneyForPdf } from './pdf/money'
import type { DocModel } from './pdf/layout'
import { registeredSections, type DataStore, type RenderCtx, type SectionRenderModel } from './registry'

export const APP_VERSION = '1'

export interface ExportOptions {
  language: Language
  currency: CurrencyKey
  /** Section keys to include; defaults to all registered sections. */
  includeSections?: string[]
  /** Injected timestamp (never Date.now() inside pure code). */
  now: string
}

export interface DataFileResult {
  bytes: Uint8Array
  filename: string
}

/** Build the versioned envelope from the store (canonical USD cents). Pure —
 *  no PDF/font/network. Exposed for tests + the round-trip vector. */
export function buildEnvelope(store: DataStore, opts: ExportOptions): ExportEnvelope {
  const include = opts.includeSections
  const sections: SectionPayload[] = registeredSections()
    .filter((s) => !include || include.includes(s.key))
    .map((s) => ({
      key: s.key,
      sectionVersion: s.sectionVersion,
      records: s.serialize(store),
    }))
  return {
    formatVersion: SUPPORTED_FORMAT_VERSION,
    generatedAt: opts.now,
    app: { name: APP_NAME, version: APP_VERSION },
    household: {
      id: store.currentHousehold?.id ?? '',
      name: store.currentHousehold?.name ?? '',
    },
    display: { language: opts.language, currency: opts.currency },
    sections,
  }
}

/**
 * Full export: build the envelope, render the visible pages in the chosen
 * language + currency, embed the payload, and return the PDF bytes + filename.
 *
 * `t` and `rate` come from the store/caller; `rate(currency)` supplies the FX
 * factor for the visible amounts (canonical cents are unchanged).
 */
export async function buildDataFile(
  store: DataStore,
  opts: ExportOptions,
  t: RenderCtx['t'],
  rate: (c: CurrencyKey) => number
): Promise<DataFileResult> {
  const envelope = buildEnvelope(store, opts)

  const locale = localeForLanguage(opts.language)
  const ctx: RenderCtx = {
    t,
    locale,
    currency: opts.currency,
    rate,
    formatMoney: formatMoneyForPdf,
    resolveUser: store.resolveUser,
  }
  const include = opts.includeSections
  const sectionModels: SectionRenderModel[] = registeredSections()
    .filter((s) => !include || include.includes(s.key))
    .map((s) => {
      const payload = envelope.sections.find((p) => p.key === s.key)
      return s.renderModel(s.read(payload ?? { key: s.key, sectionVersion: s.sectionVersion, records: [] }), ctx)
    })

  const dateLabel = envelope.generatedAt.slice(0, 10)
  const doc: DocModel = {
    title: t('Your Ortho data'),
    subtitle: `${envelope.household.name} · ${dateLabel} · ${opts.currency.toUpperCase()}`,
    sections: sectionModels,
  }

  const font = await loadFontForLanguage(opts.language)
  const bytes = await buildPdf({ envelope, doc, font })

  const safeName = (envelope.household.name || 'ortho').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ortho'
  const filename = `ortho-${safeName}-${dateLabel}.pdf`
  return { bytes, filename }
}
