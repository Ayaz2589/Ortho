'use client'

import {
  Crown,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Gauge,
  CheckCircle2,
  MinusCircle,
  Leaf,
  RefreshCw,
  Sparkles,
  House,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { Card } from '@/components/ui'
import { generateInsights } from '@/lib/finance/insights'
import { severityColor } from '@/lib/categories'
import type { Insight } from '@/lib/types'

/** Map an insight.icon keyword to a lucide icon. */
function iconFor(key: string): LucideIcon {
  switch (key) {
    case 'top':
      return Crown
    case 'up':
    case 'trend-up':
      return TrendingUp
    case 'down':
    case 'trend-down':
      return TrendingDown
    case 'alert':
      return AlertTriangle
    case 'gauge':
      return Gauge
    case 'check':
      return CheckCircle2
    case 'minus':
      return MinusCircle
    case 'leaf':
      return Leaf
    case 'subs':
      return RefreshCw
    case 'sparkle':
      return Sparkles
    case 'house':
      return House
    default:
      return Lightbulb
  }
}

export function InsightsCardStack() {
  const { transactions, budgets, properties } = useApp()
  const insights = generateInsights(transactions, budgets, properties)

  if (insights.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {insights.map((insight) => (
        <InsightRow key={insight.id} insight={insight} />
      ))}
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const color = severityColor(insight.severity)
  const Icon = iconFor(insight.icon)
  return (
    <Card className="relative overflow-hidden p-4 pl-5">
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
      />
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-normal text-text">{insight.title}</p>
          <p className="mt-0.5 text-[13px] text-text-2">{insight.body}</p>
        </div>
      </div>
    </Card>
  )
}
