// Financial Health scoring constants (spec 041). Isolated so calibration is a
// data edit, not a logic change — mirrors insights-thresholds.ts / goals-thresholds.ts.
// See specs/041-financial-health/contracts/health-scoring.md. All values are chosen
// for Ortho's target user (lower-income, immigrant, no-bank-first): supportive floors,
// calibrated to stability/direction-of-travel, never a middle-class 50/30/20 ideal.

import type { EmergencyFundLevel, HealthDimension } from '../types'

export const FINANCIAL_HEALTH_THRESHOLDS = {
  /** Default per-dimension importance weight when the user hasn't set one. */
  DEFAULT_WEIGHT: 3,
  /** Profile-null / no-data neutral score for a dimension. */
  NEUTRAL: 50,

  // Band boundaries (inclusive lower bounds).
  BAND: {
    strong: 80,
    steady: 60,
    building: 40,
    // getting_started: 0..39
  },

  // Cash flow: (income − spend) / income.
  CASHFLOW_FULL_RATIO: 0.25, // ratio ≥ this → 100
  CASHFLOW_FLOOR: 25, // ratio ≤ 0 → this (supportive, never 0)

  // Safety net: base from emergency-fund level, + bonus for an on-pace funded goal.
  EMERGENCY_BASE: {
    none: 15,
    under_1m: 35,
    '1_3m': 60,
    '3_6m': 85,
    '6m_plus': 100,
  } as Record<EmergencyFundLevel, number>,
  SAFETY_GOAL_BONUS: 15,

  // Commitment load: (housing·share + Σ fixed) / income — INVERTED (lower = healthier).
  COMMIT_LOW: 0.5, // ≤ this → 100
  COMMIT_HIGH: 0.9, // ≥ this → floor
  COMMIT_FLOOR: 20,

  // Savings momentum: piecewise-linear intention base by savings_target_fraction,
  // then max() with an actual-rate score when history exists.
  SAVINGS_INTENT_KNOTS: [
    { f: 0, score: 30 }, // zero target is not punished
    { f: 0.05, score: 50 },
    { f: 0.1, score: 70 },
    { f: 0.15, score: 90 },
  ] as ReadonlyArray<{ f: number; score: number }>,
  SAVINGS_ACTUAL_FLOOR: 30,
  SAVINGS_ACTUAL_MIN_TARGET: 0.01, // f_effective floor so a 0-target real saver still scores

  // Plan engagement: additive from a neutral base (absence never below neutral).
  PLAN_BASE: 50,
  PLAN_HAS_BUDGET: 15,
  PLAN_BUDGETS_ONTRACK: 15,
  PLAN_HAS_GOAL: 10,
  PLAN_GOALS_ONTRACK: 10,

  /** Fixed display/composite order of the five dimensions. */
  DIMENSION_ORDER: [
    'cash_flow',
    'safety_net',
    'commitment_load',
    'savings_momentum',
    'plan_engagement',
  ] as ReadonlyArray<HealthDimension>,
} as const
