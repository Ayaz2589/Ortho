// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseMoney } from '@/components/inputs'

// ─────────────────────────────────────────────────────────────────────────────
// Review 2026-08-24, major A1 — decimal-comma input.
//
// formatMoney is deliberately locale-aware (FR-004): under the shipped 'es'
// locale the app itself DISPLAYS every amount with a decimal comma ("12,34").
// parseMoney used to strip every comma as a thousands separator before
// parseFloat, so typing the amount the way the app displays it stored 100×
// the money. The separator the app renders with must round-trip.
// ─────────────────────────────────────────────────────────────────────────────

describe('parseMoney separator handling', () => {
  it('treats a final comma with 1-2 decimals as the decimal separator', () => {
    expect(parseMoney('12,34', 'usd', 1)).toBe(1234)
    expect(parseMoney('0,5', 'usd', 1)).toBe(50)
    expect(parseMoney('7,00', 'usd', 1)).toBe(700)
  })

  it('parses the European dotted-thousands + comma-decimal form', () => {
    expect(parseMoney('1.234,56', 'usd', 1)).toBe(123456)
  })

  it('keeps the US comma-thousands + dot-decimal form unchanged', () => {
    expect(parseMoney('1,234.56', 'usd', 1)).toBe(123456)
    expect(parseMoney('12.34', 'usd', 1)).toBe(1234)
  })

  it('a bare comma-with-3-digits group still reads as thousands', () => {
    expect(parseMoney('1,234', 'usd', 1)).toBe(123400)
    expect(parseMoney('1,234,567', 'usd', 1)).toBe(123456700)
  })

  it('empty and invalid input stay null', () => {
    expect(parseMoney('', 'usd', 1)).toBeNull()
    expect(parseMoney('abc', 'usd', 1)).toBeNull()
  })

  it('converts through the display rate after normalizing', () => {
    // 0,78 GBP at rate 0.78 = exactly $1.00
    expect(parseMoney('0,78', 'gbp', 0.78)).toBe(100)
  })
})
