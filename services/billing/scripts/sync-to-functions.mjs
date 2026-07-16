// Byte-copies the billing core into supabase/functions/_shared/billing/ so edge
// functions can import it (Supabase's deploy bundler only reliably follows imports
// inside supabase/functions/). The committed copy is locked byte-identical by
// test/shared-sync.test.ts — regenerate with `npm run sync:functions` after ANY
// src/ change. Source of truth is ALWAYS services/billing/src (extraction contract).
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
const destDir = join(here, '..', '..', '..', 'supabase', 'functions', '_shared', 'billing')

rmSync(destDir, { recursive: true, force: true })
mkdirSync(destDir, { recursive: true })

const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts')).sort()
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file))
}
writeFileSync(
  join(destDir, 'README.md'),
  'GENERATED — do not edit. Byte-copy of services/billing/src produced by\n' +
    '`cd services/billing && npm run sync:functions`; drift is CI-locked by\n' +
    'services/billing/test/shared-sync.test.ts.\n'
)
console.log(`synced ${files.length} files → supabase/functions/_shared/billing/`)
