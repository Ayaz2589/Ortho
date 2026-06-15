// Bank profile registry. Adding a bank = implement BankProfile and list it here
// (plus a golden fixture). No engine change required (FR-027).
import type { BankProfile } from '../engine/types'
import { tdBank } from './td-bank'
import { chaseCsv } from './chase-csv'
import { appleCard } from './apple-card'

export const PROFILES: BankProfile[] = [tdBank, chaseCsv, appleCard]
