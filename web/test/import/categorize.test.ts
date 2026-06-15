import { describe, it, expect } from 'vitest'
import { categorize } from '../../scripts/import/engine/categorize'

describe('categorize', () => {
  it('income rows are always the income category', () => {
    expect(categorize('Crossterra Payroll', 'income')).toBe('income')
    expect(categorize('Zelle · John Tejada', 'income')).toBe('income')
  })

  it('maps expense merchants to categories via codified rules', () => {
    expect(categorize('Con Edison', 'expense')).toBe('utilities')
    expect(categorize('Verizon', 'expense')).toBe('utilities')
    expect(categorize('Maintenance Fee', 'expense')).toBe('utilities')
    expect(categorize('Zelle · Vuksani Plumbing', 'expense')).toBe('utilities')
    expect(categorize('AplPay UBER EATS', 'expense')).toBe('dining')
    expect(categorize('EXXONMOBIL', 'expense')).toBe('fuel')
    expect(categorize('NYCT PAYGO', 'expense')).toBe('transit')
    expect(categorize('Uber One', 'expense')).toBe('subs')
    expect(categorize('CVS Pharmacy', 'expense')).toBe('health')
    expect(categorize('Instacart', 'expense')).toBe('groceries')
  })

  it('prefers Uber Eats (dining) and Uber One (subs) over plain Uber (transit)', () => {
    expect(categorize('Uber Eats', 'expense')).toBe('dining')
    expect(categorize('Uber One', 'expense')).toBe('subs')
    expect(categorize('Uber', 'expense')).toBe('transit')
  })

  it('maps subscription and fitness merchants (Apple Card)', () => {
    expect(categorize('OpenAI', 'expense')).toBe('subs')
    expect(categorize('Claude.ai', 'expense')).toBe('subs')
    expect(categorize('Amazon Web Services', 'expense')).toBe('subs')
    expect(categorize('Peacock', 'expense')).toBe('subs')
    expect(categorize('Apple.com/Bill', 'expense')).toBe('subs')
    expect(categorize('Retro Fitness', 'expense')).toBe('health')
  })

  it('falls back to entertainment for unknown expenses', () => {
    expect(categorize('ATM Withdrawal', 'expense')).toBe('entertainment')
    expect(categorize('Zelle · Tipu Sultan', 'expense')).toBe('entertainment')
    expect(categorize('Check #338', 'expense')).toBe('entertainment')
  })
})
