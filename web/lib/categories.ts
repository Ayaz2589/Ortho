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
  Beef,
  Wine,
  ShoppingBag,
  ParkingSquare,
  Car,
  Hammer,
  ShieldCheck,
  Dumbbell,
  Pill,
  Brain,
  Tv,
  Gamepad2,
  Ticket,
  Shirt,
  Laptop,
  Sparkles,
  Gift,
  GraduationCap,
  BookOpen,
  Landmark,
  TrendingUp,
  Briefcase,
  Building2,
  Percent,
  KeyRound,
  PackageOpen,
  RotateCcw,
  CircleDollarSign,
  type LucideIcon,
} from 'lucide-react'
import type { TransactionCategory, InsightSeverity } from './types'

export type CategoryGroupKey =
  | 'food_drink'
  | 'transport'
  | 'home'
  | 'health_wellness'
  | 'entertainment'
  | 'shopping'
  | 'subscriptions'
  | 'education'
  | 'income_employment'
  | 'income_investment'
  | 'income_other'
  | 'system'

export interface CategoryMeta {
  label: string
  icon: LucideIcon
  tint: string
  parent: CategoryGroupKey
}

export interface CategoryGroup {
  key: CategoryGroupKey
  label: string
  children: TransactionCategory[]
}

const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`

/** Category display metadata — original tints ported from iOS TransactionCategory; new tints in same warm-neutral palette. */
export const CATEGORIES: Record<TransactionCategory, CategoryMeta> = {
  // Food & Drink
  coffee:      { label: 'Coffee',     icon: Coffee,        tint: rgb(0.796, 0.647, 0.518), parent: 'food_drink' },
  groceries:   { label: 'Groceries',  icon: ShoppingBasket,tint: rgb(0.612, 0.698, 0.565), parent: 'food_drink' },
  dining:      { label: 'Dining',     icon: Utensils,      tint: rgb(0.831, 0.596, 0.486), parent: 'food_drink' },
  fast_food:   { label: 'Fast Food',  icon: Beef,          tint: rgb(0.827, 0.608, 0.498), parent: 'food_drink' },
  alcohol:     { label: 'Alcohol',    icon: Wine,          tint: rgb(0.706, 0.569, 0.686), parent: 'food_drink' },
  takeout:     { label: 'Takeout',    icon: ShoppingBag,   tint: rgb(0.804, 0.647, 0.471), parent: 'food_drink' },

  // Transport
  transit:     { label: 'Transit',    icon: Train,         tint: rgb(0.706, 0.659, 0.565), parent: 'transport' },
  fuel:        { label: 'Fuel',       icon: Fuel,          tint: rgb(0.722, 0.612, 0.659), parent: 'transport' },
  parking:     { label: 'Parking',    icon: ParkingSquare, tint: rgb(0.627, 0.686, 0.765), parent: 'transport' },
  rideshare:   { label: 'Rideshare',  icon: Car,           tint: rgb(0.686, 0.647, 0.569), parent: 'transport' },

  // Home
  rent:            { label: 'Rent',             icon: Home,       tint: rgb(0.565, 0.635, 0.698), parent: 'home' },
  utilities:       { label: 'Utilities',        icon: Zap,        tint: rgb(0.753, 0.690, 0.502), parent: 'home' },
  home_improvement:{ label: 'Home Improvement', icon: Hammer,     tint: rgb(0.588, 0.647, 0.686), parent: 'home' },
  insurance:       { label: 'Insurance',        icon: ShieldCheck,tint: rgb(0.569, 0.667, 0.627), parent: 'home' },

  // Health & Wellness
  health:       { label: 'Health',        icon: HeartPulse, tint: rgb(0.8,   0.565, 0.565), parent: 'health_wellness' },
  gym:          { label: 'Gym',           icon: Dumbbell,   tint: rgb(0.765, 0.608, 0.608), parent: 'health_wellness' },
  pharmacy:     { label: 'Pharmacy',      icon: Pill,       tint: rgb(0.706, 0.627, 0.686), parent: 'health_wellness' },
  mental_health:{ label: 'Mental Health', icon: Brain,      tint: rgb(0.667, 0.686, 0.608), parent: 'health_wellness' },

  // Entertainment
  entertainment: { label: 'Entertainment', icon: Clapperboard, tint: rgb(0.498, 0.612, 0.722), parent: 'entertainment' },
  streaming:     { label: 'Streaming',     icon: Tv,           tint: rgb(0.549, 0.608, 0.725), parent: 'entertainment' },
  gaming:        { label: 'Gaming',        icon: Gamepad2,     tint: rgb(0.588, 0.549, 0.725), parent: 'entertainment' },
  events:        { label: 'Events',        icon: Ticket,       tint: rgb(0.686, 0.608, 0.529), parent: 'entertainment' },

  // Shopping
  clothing:     { label: 'Clothing',     icon: Shirt,        tint: rgb(0.725, 0.647, 0.608), parent: 'shopping' },
  electronics:  { label: 'Electronics',  icon: Laptop,       tint: rgb(0.588, 0.647, 0.706), parent: 'shopping' },
  personal_care:{ label: 'Personal Care',icon: Sparkles,     tint: rgb(0.765, 0.667, 0.686), parent: 'shopping' },
  gifts:        { label: 'Gifts',        icon: Gift,         tint: rgb(0.784, 0.647, 0.549), parent: 'shopping' },

  // Subscriptions
  subs: { label: 'Subscriptions', icon: RefreshCw, tint: rgb(0.659, 0.659, 0.722), parent: 'subscriptions' },

  // Education
  education: { label: 'Education', icon: GraduationCap, tint: rgb(0.608, 0.667, 0.608), parent: 'education' },
  books:     { label: 'Books',     icon: BookOpen,      tint: rgb(0.627, 0.686, 0.647), parent: 'education' },

  // Income — Employment & Business
  income:          { label: 'Income',          icon: ArrowDownToLine,  tint: rgb(0.565, 0.722, 0.612), parent: 'income_other' },
  salary:          { label: 'Salary',          icon: Landmark,         tint: rgb(0.549, 0.725, 0.627), parent: 'income_employment' },
  bonus:           { label: 'Bonus',           icon: TrendingUp,       tint: rgb(0.569, 0.745, 0.608), parent: 'income_employment' },
  freelance:       { label: 'Freelance',       icon: Briefcase,        tint: rgb(0.588, 0.725, 0.667), parent: 'income_employment' },
  business_income: { label: 'Business Income', icon: Building2,        tint: rgb(0.569, 0.686, 0.647), parent: 'income_employment' },

  // Income — Investment & Assets
  dividends:    { label: 'Dividends',    icon: Percent,   tint: rgb(0.608, 0.725, 0.608), parent: 'income_investment' },
  rental_income:{ label: 'Rental Income',icon: KeyRound,  tint: rgb(0.647, 0.725, 0.627), parent: 'income_investment' },

  // Income — Other
  gift_received: { label: 'Gift Received', icon: PackageOpen,      tint: rgb(0.667, 0.745, 0.608), parent: 'income_other' },
  refund:        { label: 'Refund',        icon: RotateCcw,        tint: rgb(0.627, 0.725, 0.647), parent: 'income_other' },
  other_income:  { label: 'Other Income',  icon: CircleDollarSign, tint: rgb(0.608, 0.706, 0.647), parent: 'income_other' },

  // System — member-to-member reimbursement (never a pickable category).
  transfer: { label: 'Transfer', icon: ArrowLeftRight, tint: rgb(0.55, 0.55, 0.6), parent: 'system' },
}

/** Two-level grouped taxonomy for pickers. */
export const CATEGORY_GROUPS: { expense: CategoryGroup[]; income: CategoryGroup[] } = {
  expense: [
    { key: 'food_drink',      label: 'Food & Drink',     children: ['coffee', 'groceries', 'dining', 'fast_food', 'alcohol', 'takeout'] },
    { key: 'transport',       label: 'Transport',         children: ['transit', 'fuel', 'parking', 'rideshare'] },
    { key: 'home',            label: 'Home',              children: ['rent', 'utilities', 'home_improvement', 'insurance'] },
    { key: 'health_wellness', label: 'Health & Wellness', children: ['health', 'gym', 'pharmacy', 'mental_health'] },
    { key: 'entertainment',   label: 'Entertainment',     children: ['entertainment', 'streaming', 'gaming', 'events'] },
    { key: 'shopping',        label: 'Shopping',          children: ['clothing', 'electronics', 'personal_care', 'gifts'] },
    { key: 'subscriptions',   label: 'Subscriptions',     children: ['subs'] },
    { key: 'education',       label: 'Education',         children: ['education', 'books'] },
  ],
  income: [
    { key: 'income_employment', label: 'Employment & Business', children: ['salary', 'bonus', 'freelance', 'business_income'] },
    { key: 'income_investment', label: 'Investment & Assets',   children: ['dividends', 'rental_income'] },
    { key: 'income_other',      label: 'Other Income',          children: ['gift_received', 'refund', 'other_income', 'income'] },
  ],
}

/** All spend subcategory slugs (28 expense categories; excludes income slugs and transfer). */
export const SPEND_CATEGORIES: TransactionCategory[] = CATEGORY_GROUPS.expense.flatMap(
  (g) => g.children
)

/** All income subcategory slugs (9 new + legacy `income`). */
export const INCOME_CATEGORIES: TransactionCategory[] = CATEGORY_GROUPS.income.flatMap(
  (g) => g.children
)

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
  { key: 'peach',     bg: rgb(0.949, 0.831, 0.741), fg: rgb(0.478, 0.29, 0.169) },
  { key: 'slate',     bg: rgb(0.784, 0.831, 0.886), fg: rgb(0.231, 0.31, 0.416) },
  { key: 'sage',      bg: rgb(0.812, 0.867, 0.816), fg: rgb(0.247, 0.353, 0.271) },
  { key: 'terracotta',bg: rgb(0.91,  0.765, 0.675), fg: rgb(0.478, 0.29, 0.169) },
  { key: 'mauve',     bg: rgb(0.851, 0.769, 0.808), fg: rgb(0.353, 0.247, 0.31) },
  { key: 'sand',      bg: rgb(0.863, 0.816, 0.722), fg: rgb(0.361, 0.31, 0.208) },
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
