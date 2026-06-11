import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const PALETTE_KEYS = ['peach', 'slate', 'sage', 'terracotta', 'mauve', 'sand'] as const
export type PaletteKey = (typeof PALETTE_KEYS)[number]

export function paletteClasses(colorKey: string): { bg: string; fg: string } {
  const key = PALETTE_KEYS.includes(colorKey as PaletteKey) ? colorKey : 'peach'
  return { bg: `bg-${key}-bg`, fg: `text-${key}-fg` }
}

export const CATEGORY_META: Record<string, { label: string; icon: string; tint: string }> = {
  coffee: { label: 'Coffee', icon: '☕', tint: '#a08060' },
  groceries: { label: 'Groceries', icon: '🛒', tint: '#6a8a6a' },
  dining: { label: 'Dining', icon: '🍽️', tint: '#b06050' },
  subs: { label: 'Subscriptions', icon: '📱', tint: '#607090' },
  fuel: { label: 'Fuel', icon: '⛽', tint: '#808070' },
  rent: { label: 'Rent', icon: '🏠', tint: '#7070a0' },
  health: { label: 'Health', icon: '❤️', tint: '#a07070' },
  income: { label: 'Income', icon: '💰', tint: '#5e7e5b' },
  transit: { label: 'Transit', icon: '🚇', tint: '#608080' },
  utilities: { label: 'Utilities', icon: '💡', tint: '#707060' },
  entertainment: { label: 'Entertainment', icon: '🎬', tint: '#9060a0' },
}
