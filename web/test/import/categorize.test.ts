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
    expect(categorize('AplPay UBER EATS', 'expense')).toBe('takeout')
    expect(categorize('EXXONMOBIL', 'expense')).toBe('fuel')
    expect(categorize('NYCT PAYGO', 'expense')).toBe('transit')
    expect(categorize('Uber One', 'expense')).toBe('subs')
    expect(categorize('CVS Pharmacy', 'expense')).toBe('pharmacy')
    expect(categorize('Instacart', 'expense')).toBe('groceries')
  })

  it('prefers Uber Eats (takeout) and Uber One (subs) and Lyft (rideshare) over plain Uber (transit)', () => {
    expect(categorize('Uber Eats', 'expense')).toBe('takeout')
    expect(categorize('DoorDash', 'expense')).toBe('takeout')
    expect(categorize('Grubhub', 'expense')).toBe('takeout')
    expect(categorize('Uber One', 'expense')).toBe('subs')
    expect(categorize('Lyft', 'expense')).toBe('rideshare')
    expect(categorize('Uber', 'expense')).toBe('transit')
  })

  it('maps subscription, streaming, fitness, and pharmacy merchants (spec 031)', () => {
    expect(categorize('OpenAI', 'expense')).toBe('subs')
    expect(categorize('Claude.ai', 'expense')).toBe('subs')
    expect(categorize('Amazon Web Services', 'expense')).toBe('subs')
    // Streaming services now have their own subcategory
    expect(categorize('Peacock', 'expense')).toBe('streaming')
    expect(categorize('Netflix', 'expense')).toBe('streaming')
    expect(categorize('Hulu', 'expense')).toBe('streaming')
    expect(categorize('Apple.com/Bill', 'expense')).toBe('subs')
    // Fitness/gym is now its own subcategory
    expect(categorize('Equinox', 'expense')).toBe('gym')
    expect(categorize('Retro Fitness', 'expense')).toBe('gym')
    expect(categorize('Peloton', 'expense')).toBe('gym')
    // Pharmacy is now its own subcategory
    expect(categorize('CVS Pharmacy', 'expense')).toBe('pharmacy')
    expect(categorize('Walgreens', 'expense')).toBe('pharmacy')
    // Parking
    expect(categorize('ParkMobile', 'expense')).toBe('parking')
    // Gaming
    expect(categorize('GameStop', 'expense')).toBe('gaming')
    expect(categorize('Steam', 'expense')).toBe('gaming')
  })

  it('falls back to entertainment for unknown expenses', () => {
    expect(categorize('ATM Withdrawal', 'expense')).toBe('entertainment')
    expect(categorize('Zelle · Tipu Sultan', 'expense')).toBe('entertainment')
    expect(categorize('Check #338', 'expense')).toBe('entertainment')
  })
})
