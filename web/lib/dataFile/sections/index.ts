// spec 032 — register the built-in data sections. Adding a future section
// (widgets, budgets, goals) means importing it here and adding one register()
// call — nothing in the export/import pipeline changes.

import { _resetRegistry, register } from '../registry'
import { transactionsSection } from './transactions'
import { housingSection } from './housing'

/** Reset the registry to exactly the built-in sections (order matters for
 *  export + summary). Called once at module load and reusable by tests. */
export function registerBuiltinSections(): void {
  _resetRegistry()
  register(transactionsSection as never)
  register(housingSection as never)
}

registerBuiltinSections()
