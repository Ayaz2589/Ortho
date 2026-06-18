import {
  Coffee,
  ShoppingBasket,
  Utensils,
  RefreshCw,
  Fuel,
  Home,
  HeartPulse,
  ArrowDownToLine,
  Train,
  Zap,
  Clapperboard,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react'
import type { TransactionCategory, InsightSeverity } from './types'

export interface CategoryMeta {
  label: string
  icon: LucideIcon
  tint: string
}

const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`

/** Category display metadata — tints ported from iOS TransactionCategory. */
export const CATEGORIES: Record<TransactionCategory, CategoryMeta> = {
  coffee: { label: 'Coffee', icon: Coffee, tint: rgb(0.796, 0.647, 0.518) },
  groceries: { label: 'Groceries', icon: ShoppingBasket, tint: rgb(0.612, 0.698, 0.565) },
  dining: { label: 'Dining', icon: Utensils, tint: rgb(0.831, 0.596, 0.486) },
  subs: { label: 'Subscriptions', icon: RefreshCw, tint: rgb(0.659, 0.659, 0.722) },
  fuel: { label: 'Fuel', icon: Fuel, tint: rgb(0.722, 0.612, 0.659) },
  rent: { label: 'Rent', icon: Home, tint: rgb(0.565, 0.635, 0.698) },
  health: { label: 'Health', icon: HeartPulse, tint: rgb(0.8, 0.565, 0.565) },
  income: { label: 'Income', icon: ArrowDownToLine, tint: rgb(0.565, 0.722, 0.612) },
  transit: { label: 'Transit', icon: Train, tint: rgb(0.706, 0.659, 0.565) },
  utilities: { label: 'Utilities', icon: Zap, tint: rgb(0.753, 0.69, 0.502) },
  entertainment: { label: 'Entertainment', icon: Clapperboard, tint: rgb(0.498, 0.612, 0.722) },
  // Member-to-member reimbursement (not a spend category; excluded from SPEND_CATEGORIES).
  transfer: { label: 'Transfer', icon: ArrowLeftRight, tint: rgb(0.55, 0.55, 0.6) },
}

/** All spend categories (excludes income), in enum order. */
export const SPEND_CATEGORIES: TransactionCategory[] = [
  'coffee',
  'groceries',
  'dining',
  'subs',
  'fuel',
  'rent',
  'health',
  'transit',
  'utilities',
  'entertainment',
]

export function categoryMeta(c: TransactionCategory): CategoryMeta {
  return CATEGORIES[c]
}

/** Severity → CSS color token. Lower rawValue sorts first. */
export const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
}

export function severityColor(s: InsightSeverity): string {
  switch (s) {
    case 'critical':
      return 'var(--destructive)'
    case 'warning':
      return 'var(--accent)'
    case 'positive':
      return 'var(--positive)'
    default:
      return 'var(--text-2)'
  }
}

export interface PaletteOption {
  key: string
  bg: string
  fg: string
}

/** Household member color palette — ported from iOS OrthoColorOption. */
export const PALETTE: PaletteOption[] = [
  { key: 'peach', bg: rgb(0.949, 0.831, 0.741), fg: rgb(0.478, 0.29, 0.169) },
  { key: 'slate', bg: rgb(0.784, 0.831, 0.886), fg: rgb(0.231, 0.31, 0.416) },
  { key: 'sage', bg: rgb(0.812, 0.867, 0.816), fg: rgb(0.247, 0.353, 0.271) },
  { key: 'terracotta', bg: rgb(0.91, 0.765, 0.675), fg: rgb(0.478, 0.29, 0.169) },
  { key: 'mauve', bg: rgb(0.851, 0.769, 0.808), fg: rgb(0.353, 0.247, 0.31) },
  { key: 'sand', bg: rgb(0.863, 0.816, 0.722), fg: rgb(0.361, 0.31, 0.208) },
]

export function paletteFor(key: string): PaletteOption {
  return PALETTE.find((p) => p.key === key) ?? PALETTE[0]
}

/** Derive an avatar initial from a name. Joint names ("A & B") → "A+B". */
export function deriveInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '·'
  const joint = trimmed.match(/^([A-Za-z])\s*[+&]\s*([A-Za-z])/)
  if (joint) return `${joint[1]}+${joint[2]}`.toUpperCase()
  return trimmed[0].toUpperCase()
}
