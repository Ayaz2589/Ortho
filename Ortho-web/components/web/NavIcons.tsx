'use client'

// Pastel "sticker" nav glyphs — ported from the design handoff (NavIconsColor).
// Shapes filled with category/owner tints, outlined in --text at 0.75pt.
// tone="muted" dims the whole sticker to 42%.

type Tone = 'full' | 'muted'

function wrap(tone: Tone, children: React.ReactNode, size: number) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      style={{ opacity: tone === 'muted' ? 0.42 : 1, display: 'block' }}
    >
      {children}
    </svg>
  )
}

export function NavIconColor({
  name,
  size = 26,
  tone = 'full',
}: {
  name: 'dashboard' | 'transactions' | 'housing' | 'settings'
  size?: number
  tone?: Tone
}) {
  if (name === 'dashboard') {
    return wrap(
      tone,
      <>
        <line
          x1="4"
          y1="22"
          x2="24"
          y2="22"
          stroke="var(--text)"
          strokeWidth="0.75"
          strokeLinecap="round"
          opacity="0.35"
        />
        <rect x="5.5" y="14.5" width="4.5" height="7" rx="1.2" fill="var(--cat-coffee)" stroke="var(--text)" strokeWidth="0.75" />
        <rect x="11.75" y="7" width="4.5" height="14.5" rx="1.2" fill="var(--cat-income)" stroke="var(--text)" strokeWidth="0.75" />
        <rect x="18" y="11" width="4.5" height="10.5" rx="1.2" fill="var(--cat-dining)" stroke="var(--text)" strokeWidth="0.75" />
      </>,
      size
    )
  }
  if (name === 'transactions') {
    return wrap(
      tone,
      <>
        <path d="M7 4.6h4.4v8.5h2.1l-4.3 4.6-4.3-4.6h2.1V4.6z" fill="var(--cat-income)" stroke="var(--text)" strokeWidth="0.75" strokeLinejoin="round" />
        <path d="M20.6 23.4h-4.4v-8.5h-2.1l4.3-4.6 4.3 4.6h-2.1v8.5z" fill="var(--cat-dining)" stroke="var(--text)" strokeWidth="0.75" strokeLinejoin="round" />
      </>,
      size
    )
  }
  if (name === 'housing') {
    return wrap(
      tone,
      <>
        <path d="M4.5 12.5L14 4.5l9.5 8v10a1 1 0 01-1 1H5.5a1 1 0 01-1-1v-10z" fill="var(--owner-maya-bg)" stroke="var(--text)" strokeWidth="0.75" strokeLinejoin="round" />
        <path d="M3 13.2L14 3.8l11 9.4-1 1.2L14 6.5 4 14.4 3 13.2z" fill="var(--cat-rent)" stroke="var(--text)" strokeWidth="0.75" strokeLinejoin="round" />
        <path d="M11.5 23.5v-5a2.5 2.5 0 015 0v5" fill="var(--cat-income)" stroke="var(--text)" strokeWidth="0.75" strokeLinejoin="round" />
        <circle cx="15.4" cy="20.6" r="0.55" fill="var(--text)" />
      </>,
      size
    )
  }
  // settings — eight-tooth gear
  const teeth = []
  const cx = 14
  const cy = 14
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8
    const r = 9.4
    const tx = cx + Math.cos(angle) * r
    const ty = cy + Math.sin(angle) * r
    teeth.push(
      <rect
        key={i}
        x={-2.3}
        y={-2.4}
        width="4.6"
        height="4.8"
        rx="1.2"
        fill="var(--cat-subs)"
        stroke="var(--text)"
        strokeWidth="0.75"
        transform={`translate(${tx} ${ty}) rotate(${(angle * 180) / Math.PI + 45})`}
      />
    )
  }
  return wrap(
    tone,
    <>
      {teeth}
      <circle cx={cx} cy={cy} r="6.4" fill="var(--cat-subs)" stroke="var(--text)" strokeWidth="0.75" />
      <circle cx={cx} cy={cy} r="2.8" fill="var(--surface)" stroke="var(--text)" strokeWidth="0.75" />
    </>,
    size
  )
}
