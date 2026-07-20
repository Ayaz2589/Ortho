// Browser-only CSV profile registry. Used by useCsvImport() for bank detection.
// Keep separate from PROFILES (in index.ts) — that registry serves the CLI's
// make-ingest path and mixes PDF + CSV profiles together.
import type { BankProfile } from '../engine/types'
import { chaseCsv } from './chase-csv'
import { amexCsv } from './amex-csv'
import { citiCsv } from './citi-csv'
import { capitalOneCsv } from './capital-one-csv'
import { bofaCsv } from './bofa-csv'
import { wellsFargoCsv } from './wellsfargo-csv'
import { tdBankCsv } from './td-bank-csv'

export const CSV_PROFILES: BankProfile[] = [
  chaseCsv,
  amexCsv,
  citiCsv,
  capitalOneCsv,
  bofaCsv,
  wellsFargoCsv,
  tdBankCsv,
  // TODO: santanderCsv — blocked on format research
]
