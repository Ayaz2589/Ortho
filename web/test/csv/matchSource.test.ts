import { describe, it, expect } from 'vitest'
import { bankNameFromLabel, matchSourceForBank } from '@/lib/csv/matchSource'

describe('bankNameFromLabel', () => {
  it('strips the parenthetical format suffix', () => {
    expect(bankNameFromLabel('Chase (Credit Card CSV)')).toBe('Chase')
    expect(bankNameFromLabel('Bank of America (CSV)')).toBe('Bank of America')
    expect(bankNameFromLabel('Capital One (Credit Card CSV)')).toBe('Capital One')
  })
})

describe('matchSourceForBank', () => {
  it('matches a card whose name contains the bank name (case-insensitive)', () => {
    const cards = ['Chase Sapphire', 'Amex Gold', 'Household Checking']
    expect(matchSourceForBank('chase', 'Chase (Credit Card CSV)', cards)).toBe('Chase Sapphire')
  })

  it('matches via an alias (amex → american express)', () => {
    expect(matchSourceForBank('amex-csv', 'Amex (Credit Card CSV)', ['American Express Blue'])).toBe(
      'American Express Blue'
    )
  })

  it('matches a short TD alias', () => {
    expect(matchSourceForBank('td-bank-csv', 'TD Bank (Checking CSV)', ['TD Convenience'])).toBe('TD Convenience')
  })

  it('returns "" when no card matches', () => {
    expect(matchSourceForBank('chase', 'Chase (Credit Card CSV)', ['Amex Gold', 'Citi Double Cash'])).toBe('')
  })

  it('returns "" when the household has no cards', () => {
    expect(matchSourceForBank('chase', 'Chase (Credit Card CSV)', [])).toBe('')
  })

  it('returns the first matching card when several match', () => {
    expect(matchSourceForBank('chase', 'Chase (Credit Card CSV)', ['Chase Freedom', 'Chase Sapphire'])).toBe(
      'Chase Freedom'
    )
  })
})
