'use client'

import type { CSSProperties } from 'react'

/**
 * Calm loading placeholder (spec 032).
 *
 * A single static block filled with the adaptive `--chip-bg` token. It is
 * deliberately MOTIONLESS — no shimmer, pulse, or gradient sweep — because the
 * constitution (Principle IV) forbids "skeleton shimmer" and Principle II keeps
 * chrome calm. It carries `aria-hidden` because it conveys no content on its own;
 * the enclosing page/section skeleton owns the `role="status"` busy announcement.
 */
export function Skeleton({
  className,
  width,
  height = 12,
  radius = 6,
}: {
  className?: string
  width?: number | string
  height?: number | string
  radius?: number | 'full'
}) {
  const style: CSSProperties = {
    background: 'var(--chip-bg)',
    height,
    borderRadius: radius === 'full' ? 9999 : radius,
  }
  if (width !== undefined) style.width = width
  else style.width = '100%'

  return <div aria-hidden="true" className={className} style={style} />
}

/** A short stack of text-line placeholders; the last line is shorter, like prose. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}
