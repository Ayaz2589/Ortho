export type Appearance = 'system' | 'light' | 'dark'

const STYLE_ID = 'ortho-appearance-override'

/**
 * The dark-mode token block from globals.css. Because globals.css only applies
 * these via `@media (prefers-color-scheme: dark)`, we re-inject them under a
 * `[data-appearance]` selector so the user can force light/dark regardless of
 * the OS setting.
 */
const DARK_VARS = `
  --bg: rgb(14, 14, 12);
  --surface: rgb(26, 25, 22);
  --text: rgb(237, 235, 230);
  --text-2: rgba(237, 235, 230, 0.55);
  --text-3: rgba(237, 235, 230, 0.35);
  --accent: rgb(160, 142, 112);
  --positive: rgb(114, 150, 111);
  --destructive: rgb(200, 105, 98);
  --hairline: rgba(237, 235, 230, 0.08);
  --peach-bg: rgb(80, 40, 20); --peach-fg: rgb(250, 180, 140);
  --slate-bg: rgb(30, 45, 65); --slate-fg: rgb(160, 185, 220);
  --sage-bg: rgb(25, 55, 25); --sage-fg: rgb(150, 200, 150);
  --terracotta-bg: rgb(75, 30, 20); --terracotta-fg: rgb(230, 150, 120);
  --mauve-bg: rgb(55, 30, 65); --mauve-fg: rgb(195, 155, 220);
  --sand-bg: rgb(60, 45, 20); --sand-fg: rgb(210, 180, 120);
  --surface-2: #23211d;
  --chip-bg: rgba(255, 255, 255, 0.07);
  --chip-text: rgba(242, 239, 232, 0.72);
`

const LIGHT_VARS = `
  --bg: rgb(247, 245, 240);
  --surface: rgb(255, 255, 255);
  --text: rgb(26, 24, 21);
  --text-2: rgba(26, 24, 21, 0.55);
  --text-3: rgba(26, 24, 21, 0.35);
  --accent: rgb(140, 122, 92);
  --positive: rgb(94, 126, 91);
  --destructive: rgb(174, 81, 74);
  --hairline: rgba(26, 24, 21, 0.07);
  --peach-bg: rgb(250, 224, 206); --peach-fg: rgb(160, 80, 40);
  --slate-bg: rgb(210, 218, 230); --slate-fg: rgb(50, 70, 100);
  --sage-bg: rgb(200, 220, 200); --sage-fg: rgb(40, 90, 40);
  --terracotta-bg: rgb(240, 210, 195); --terracotta-fg: rgb(150, 60, 40);
  --mauve-bg: rgb(225, 210, 230); --mauve-fg: rgb(100, 60, 120);
  --sand-bg: rgb(240, 230, 205); --sand-fg: rgb(120, 90, 40);
  --surface-2: #f1eee7;
  --chip-bg: rgba(26, 24, 21, 0.05);
  --chip-text: rgba(26, 24, 21, 0.62);
`

function ensureStyleTag(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = `:root[data-appearance="dark"] { ${DARK_VARS} }
:root[data-appearance="light"] { ${LIGHT_VARS} }`
    document.head.appendChild(el)
  }
  return el
}

/** Apply the chosen appearance to <html>: forced light/dark or OS default. */
export function applyAppearance(mode: Appearance) {
  if (typeof document === 'undefined') return
  ensureStyleTag()
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-appearance')
    root.style.colorScheme = 'light dark'
  } else {
    root.setAttribute('data-appearance', mode)
    root.style.colorScheme = mode
  }
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
