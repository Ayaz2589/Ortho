import { describe, it, expect } from 'vitest'
import { rankedMerchants, suggestMerchants } from '../../lib/csv/merchantSuggest'

describe('rankedMerchants', () => {
  it('returns distinct merchants ordered by frequency', () => {
    const txns = [
      { merchant: 'Uber Eats' },
      { merchant: 'Subway' },
      { merchant: 'Uber Eats' },
      { merchant: 'Uber Eats' },
      { merchant: 'Subway' },
    ]
    expect(rankedMerchants(txns)).toEqual(['Uber Eats', 'Subway'])
  })

  it('collapses case/format variants to one entry (first spelling wins)', () => {
    const txns = [{ merchant: 'Uber Eats' }, { merchant: 'UBER EATS' }]
    expect(rankedMerchants(txns)).toEqual(['Uber Eats'])
  })

  it('ignores blank merchant names', () => {
    expect(rankedMerchants([{ merchant: '   ' }, { merchant: 'Subway' }])).toEqual(['Subway'])
  })
})

describe('suggestMerchants', () => {
  const known = ['Uber Eats', 'Subway', 'Whole Foods']

  it('suggests a known name for a messy CSV descriptor', () => {
    expect(suggestMerchants('UBER EATS 8005928996 CA', known)).toEqual(['Uber Eats'])
  })

  it('returns nothing once the value already matches a known name', () => {
    expect(suggestMerchants('Uber Eats', known)).toEqual([])
    expect(suggestMerchants('uber eats', known)).toEqual([])
  })

  it('returns nothing when no known name is similar', () => {
    expect(suggestMerchants('Shell Gas #42', known)).toEqual([])
  })

  it('caps the number of suggestions', () => {
    const many = ['Amazon Prime', 'Amazon Mktpl', 'Amazon Fresh', 'Amazon Music']
    expect(suggestMerchants('AMAZON something', many, 2)).toHaveLength(2)
  })

  it('returns [] for an empty descriptor', () => {
    expect(suggestMerchants('', known)).toEqual([])
  })
})
