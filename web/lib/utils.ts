import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// NOTE: the palette/category source of truth is lib/categories.ts
// (paletteFor / PALETTE / CATEGORIES). A prior paletteClasses/PALETTE_KEYS/
// CATEGORY_META lived here, unused in production and already drifted from
// categories.ts (and paletteClasses emitted dynamic Tailwind classes the JIT
// scanner never sees) — removed. Route any need through lib/categories.ts.
