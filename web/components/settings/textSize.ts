// Spec 040 — a per-device "text size" preference. It scales the whole UI
// proportionally via CSS `zoom` on <html>, so pixel-locked text (the app is not
// rem-based) still scales without a per-component refactor. Standardized `zoom`
// (Baseline 2024) rescales the CSS pixel, so viewport units (`100dvh`) and
// `position: fixed` keep working — the app shell and tab bar do not overflow.
//
// This mirrors components/settings/appearance.ts: a read/write/apply trio plus a
// pre-paint boot script (built here so it can never drift from the scale map),
// the single source of truth for both boot-time apply and the Settings picker.

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'

/** Ascending order — also the render order of the Settings picker. */
export const TEXT_SIZES: readonly TextSize[] = ['small', 'medium', 'large', 'xlarge']

/** The shipped default: a subtle step up from the pre-feature baseline. */
export const DEFAULT_TEXT_SIZE: TextSize = 'medium'

/**
 * Whole-UI zoom multiplier per size. `small` is exactly 1 (today's density and
 * the "way back"); the steps are gentle and strictly increasing so every size
 * looks good with the current design.
 */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 1,
  medium: 1.06,
  large: 1.14,
  xlarge: 1.22,
}

const STORAGE_KEY = 'textSize'

function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v)
}

/**
 * Apply the chosen size to <html>: a `zoom` scale (the whole-UI multiplier) plus
 * a `data-text-size` attribute for debuggability/tests. `setProperty('zoom', …)`
 * (rather than `.style.zoom`) sidesteps DOM typing gaps for the non-standard-ish
 * `zoom` property. No-op during SSR.
 */
export function applyTextSize(size: TextSize) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('zoom', String(TEXT_SIZE_SCALE[size]))
  root.setAttribute('data-text-size', size)
}

/** Read the persisted size; missing/empty/unknown/unavailable → the default. Never throws. */
export function readTextSize(): TextSize {
  if (typeof localStorage === 'undefined') return DEFAULT_TEXT_SIZE
  const v = localStorage.getItem(STORAGE_KEY)
  return isTextSize(v) ? v : DEFAULT_TEXT_SIZE
}

/** Persist the size, then apply it live. */
export function writeTextSize(size: TextSize) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, size)
  applyTextSize(size)
}

/**
 * The inline script the root layout injects to apply the saved size BEFORE first
 * paint (no flash — FR-008). Generated from TEXT_SIZE_SCALE / DEFAULT_TEXT_SIZE
 * so it stays in lockstep with this module. Mirrors app/layout.tsx's
 * APPEARANCE_BOOT: runs synchronously during HTML parse, wrapped in try/catch.
 */
export function textSizeBootScript(): string {
  return `(function(){try{var S=${JSON.stringify(TEXT_SIZE_SCALE)},d=${JSON.stringify(
    DEFAULT_TEXT_SIZE,
  )};var v=localStorage.getItem('${STORAGE_KEY}');var s=Object.prototype.hasOwnProperty.call(S,v)?v:d;var r=document.documentElement;r.style.zoom=String(S[s]);r.setAttribute('data-text-size',s);}catch(e){}})();`
}
