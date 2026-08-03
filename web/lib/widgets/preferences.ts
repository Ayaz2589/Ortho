/**
 * Per-browser widget on/off preferences (spec 034 — foundation).
 *
 * Which dashboard widgets a member has enabled is a client preference, persisted
 * as a single JSON object under `ortho.widgets` — mirroring the defensive
 * read/write convention of `lib/flags.ts` and `lib/skeletonCounts.ts`. Prefs are
 * SPARSE: only widgets the member explicitly toggled are stored; anything absent
 * falls back to the definition's `defaultEnabled`. Every read is validated and
 * never throws, so missing/corrupt storage simply yields the defaults (FR-007).
 */
import { WIDGETS, type WidgetDefinition } from './registry'

/** id → enabled. Absent id means "use the definition's default". */
export type WidgetPrefs = Record<string, boolean>

export const WIDGETS_STORAGE_KEY = 'ortho.widgets'

/**
 * Read the whole prefs map defensively. Any failure — no storage, corrupt JSON,
 * a non-object (array / scalar) shape — resolves to `{}` rather than throwing.
 * Only boolean-valued keys are kept; other value types are dropped.
 */
export function readWidgetPrefs(): WidgetPrefs {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(WIDGETS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: WidgetPrefs = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Persist the prefs map. Best-effort: a no-op if storage is unavailable or throws
 * (private mode / quota), so recording a toggle never breaks the caller.
 */
export function writeWidgetPrefs(prefs: WidgetPrefs): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — widget prefs are best-effort */
  }
}

/** A widget is enabled if explicitly stored; otherwise its declared default. */
export function isWidgetEnabled(def: WidgetDefinition, prefs: WidgetPrefs): boolean {
  const stored = prefs[def.id]
  return typeof stored === 'boolean' ? stored : def.defaultEnabled
}

/** The enabled widgets, in registry (declaration) order. Unknown stored ids —
 *  those not matching any current definition — are naturally excluded. */
export function enabledWidgets(prefs: WidgetPrefs): WidgetDefinition[] {
  return WIDGETS.filter((def) => isWidgetEnabled(def, prefs))
}

/** Merge one toggle into the map and persist. Returns the next prefs so callers
 *  (e.g. the hook) can update React state from the same value that was stored. */
export function setWidgetEnabled(id: string, on: boolean, prefs: WidgetPrefs): WidgetPrefs {
  const next = { ...prefs, [id]: on }
  writeWidgetPrefs(next)
  return next
}
