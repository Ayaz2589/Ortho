export type Appearance = 'system' | 'light' | 'dark'

/**
 * Theme token values that differ between light and dark — these mirror the
 * `:root` (light) and `@media (prefers-color-scheme: dark)` blocks in
 * globals.css.
 *
 * For a forced light/dark mode we apply these as INLINE custom properties on
 * <html>. Inline vars win over any stylesheet and — crucially — don't depend on
 * a CSS rule being (re)compiled, so forcing a theme works even if the dev
 * server is serving a stale globals.css. The same map is embedded verbatim into
 * the pre-paint boot script in app/layout.tsx, so this is the single source of
 * truth for both the boot-time apply and the live Settings toggle.
 */
export const THEME_VARS: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--bg': 'rgb(247, 245, 240)',
    '--surface': 'rgb(255, 255, 255)',
    '--text': 'rgb(26, 24, 21)',
    '--text-2': 'rgba(26, 24, 21, 0.55)',
    '--text-3': 'rgba(26, 24, 21, 0.35)',
    '--accent': 'rgb(140, 122, 92)',
    '--positive': 'rgb(94, 126, 91)',
    '--destructive': 'rgb(174, 81, 74)',
    '--hairline': 'rgba(26, 24, 21, 0.07)',
    '--peach-bg': 'rgb(250, 224, 206)',
    '--peach-fg': 'rgb(160, 80, 40)',
    '--slate-bg': 'rgb(210, 218, 230)',
    '--slate-fg': 'rgb(50, 70, 100)',
    '--sage-bg': 'rgb(200, 220, 200)',
    '--sage-fg': 'rgb(40, 90, 40)',
    '--terracotta-bg': 'rgb(240, 210, 195)',
    '--terracotta-fg': 'rgb(150, 60, 40)',
    '--mauve-bg': 'rgb(225, 210, 230)',
    '--mauve-fg': 'rgb(100, 60, 120)',
    '--sand-bg': 'rgb(240, 230, 205)',
    '--sand-fg': 'rgb(120, 90, 40)',
    '--surface-2': '#f1eee7',
    '--chip-bg': 'rgba(26, 24, 21, 0.05)',
    '--chip-text': 'rgba(26, 24, 21, 0.62)',
  },
  dark: {
    '--bg': 'rgb(14, 14, 12)',
    '--surface': 'rgb(26, 25, 22)',
    '--text': 'rgb(237, 235, 230)',
    '--text-2': 'rgba(237, 235, 230, 0.55)',
    '--text-3': 'rgba(237, 235, 230, 0.35)',
    '--accent': 'rgb(160, 142, 112)',
    '--positive': 'rgb(114, 150, 111)',
    '--destructive': 'rgb(200, 105, 98)',
    '--hairline': 'rgba(237, 235, 230, 0.08)',
    '--peach-bg': 'rgb(80, 40, 20)',
    '--peach-fg': 'rgb(250, 180, 140)',
    '--slate-bg': 'rgb(30, 45, 65)',
    '--slate-fg': 'rgb(160, 185, 220)',
    '--sage-bg': 'rgb(25, 55, 25)',
    '--sage-fg': 'rgb(150, 200, 150)',
    '--terracotta-bg': 'rgb(75, 30, 20)',
    '--terracotta-fg': 'rgb(230, 150, 120)',
    '--mauve-bg': 'rgb(55, 30, 65)',
    '--mauve-fg': 'rgb(195, 155, 220)',
    '--sand-bg': 'rgb(60, 45, 20)',
    '--sand-fg': 'rgb(210, 180, 120)',
    '--surface-2': '#23211d',
    '--chip-bg': 'rgba(255, 255, 255, 0.07)',
    '--chip-text': 'rgba(242, 239, 232, 0.72)',
  },
}

/**
 * Apply the chosen appearance to <html>: forced light/dark (inline vars +
 * `data-appearance` attribute for component-level rules), or OS default
 * (clear both, hand back to the media query).
 */
export function applyAppearance(mode: Appearance) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // Clear any previously-forced inline vars so switching themes is clean.
  for (const key of Object.keys(THEME_VARS.light)) root.style.removeProperty(key)
  if (mode === 'system') {
    root.removeAttribute('data-appearance')
    root.style.colorScheme = 'light dark'
    return
  }
  root.setAttribute('data-appearance', mode)
  root.style.colorScheme = mode
  const vars = THEME_VARS[mode]
  for (const key in vars) root.style.setProperty(key, vars[key])
}

export function readAppearance(): Appearance {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem('appearance')
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function writeAppearance(mode: Appearance) {
  if (typeof localStorage !== 'undefined') localStorage.setItem('appearance', mode)
  applyAppearance(mode)
}
