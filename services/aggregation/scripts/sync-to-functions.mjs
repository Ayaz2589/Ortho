// Byte-copies the aggregation core into supabase/functions/_shared/aggregation/
// so edge functions can import it (Supabase's deploy bundler only reliably follows
// imports inside supabase/functions/). The committed copy is locked byte-identical
// by test/shared-sync.test.ts — regenerate with `npm run sync:functions` after ANY
// src/ change. Source of truth is ALWAYS services/aggregation/src (extraction contract).
//
// The walk is RECURSIVE (spec 028): src/ now has subdirectories (e.g. deprecated/),
// so nested .ts files are copied with their relative structure preserved.
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'src')
const destDir = join(here, '..', '..', '..', 'supabase', 'functions', '_shared', 'aggregation')

/** Depth-first list of every .ts file under `dir`, as paths relative to srcDir. */
function listTsFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(relative(srcDir, full))
    }
  }
  return out
}

rmSync(destDir, { recursive: true, force: true })
mkdirSync(destDir, { recursive: true })

const files = listTsFiles(srcDir).sort()
for (const rel of files) {
  const dest = join(destDir, rel)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(srcDir, rel), dest)
}
writeFileSync(
  join(destDir, 'README.md'),
  'GENERATED — do not edit. Byte-copy of services/aggregation/src produced by\n' +
    '`cd services/aggregation && npm run sync:functions`; drift is CI-locked by\n' +
    'services/aggregation/test/shared-sync.test.ts.\n'
)
console.log(`synced ${files.length} files → supabase/functions/_shared/aggregation/`)
