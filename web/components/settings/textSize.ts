// Spec 040 — a per-device "text size" preference. It scales the whole UI
// proportionally via CSS `zoom` on <html>, so pixel-locked text (the app is not
// rem-based) still scales without a per-component refactor. Standardized `zoom`
// (Baseline 2024 — Chrome 128 / Firefox 126 / Safari 18) rescales the CSS pixel,
// so viewport units (`100dvh`) and `position: fixed` keep working — the app shell
// and tab bar do not overflow. NOTE: the Capacitor iOS shell targets iOS 15+
// (pre-standardized WebKit on iOS 15–17), so the whole-UI scale must be visually
// confirmed there before relying on it (quickstart.md manual check).
//
// This mirrors components/settings/appearance.ts: a read/write/apply trio plus a
// pre-paint boot script (built here so it can never drift from the scale map),
// the single source of truth for both boot-time apply and the Settings picker.

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'

/**
 * Whole-UI zoom multiplier per size. `small` is exactly 1 (today's density and
 * the "way back"); every value is >= 1 (the app never shrinks type below the
 * baseline — this also preserves the mobile 16px input floor that stops iOS
 * focus-zoom, FR-012) and the steps are gentle and strictly increasing so each
 * size looks good with the current design. This map is the single source of
 * truth: the valid sizes, their order, and the boot script all derive from it.
 */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 1,
  medium: 1.06,
  large: 1.14,
  xlarge: 1.22,
}

/** Ascending order (insertion order of the scale map) — also the picker's render order. */
export const TEXT_SIZES = Object.keys(TEXT_SIZE_SCALE) as TextSize[]

/** The shipped default: a subtle step up from the pre-feature baseline. */
export const DEFAULT_TEXT_SIZE: TextSize = 'medium'

const STORAGE_KEY = 'textSize'

/** A value is a valid size iff it has a scale entry — the same check the boot script uses. */
function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEXT_SIZE_SCALE, v)
}

/**
 * Apply the chosen size to <html>: a `zoom` scale (the whole-UI multiplier) plus
 * a `data-text-size` attribute for debuggability/tests. `setProperty('zoom', …)`
 * (rather than `.style.zoom`) sidesteps DOM typing gaps for the `zoom` property.
 * No-op during SSR.
 */
export function applyTextSize(size: TextSize) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('zoom', String(TEXT_SIZE_SCALE[size]))
  root.setAttribute('data-text-size', size)
}

/**
 * Read the persisted size; missing/empty/unknown → the default. Never throws —
 * accessing `localStorage` can throw (SSR: undefined; Safari private mode /
 * disabled storage: SecurityError), so it is fully guarded.
 */
export function readTextSize(): TextSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isTextSize(v) ? v : DEFAULT_TEXT_SIZE
  } catch {
    return DEFAULT_TEXT_SIZE
  }
}

/** Persist the size (best-effort — a throwing/absent store is ignored), then apply it live. */
export function writeTextSize(size: TextSize) {
  try {
    localStorage.setItem(STORAGE_KEY, size)
  } catch {
    // storage unavailable (private mode / disabled) — still apply for this session
  }
  applyTextSize(size)
}

/**
 * The inline script the root layout injects to apply the saved size BEFORE first
 * paint (no flash — FR-008). Generated from TEXT_SIZE_SCALE / DEFAULT_TEXT_SIZE
 * so it stays in lockstep with this module and validates against the SAME set as
 * `isTextSize` (own-property on the scale map). Mirrors app/layout.tsx's
 * APPEARANCE_BOOT: runs synchronously during HTML parse, wrapped in try/catch.
 */
export function textSizeBootScript(): string {
  return `(function(){try{var S=${JSON.stringify(TEXT_SIZE_SCALE)},d=${JSON.stringify(
    DEFAULT_TEXT_SIZE,
  )};var v=localStorage.getItem('${STORAGE_KEY}');var s=Object.prototype.hasOwnProperty.call(S,v)?v:d;var r=document.documentElement;r.style.zoom=String(S[s]);r.setAttribute('data-text-size',s);}catch(e){}})();`
}
