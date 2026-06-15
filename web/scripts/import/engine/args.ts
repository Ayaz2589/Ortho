// Tiny CLI flag parser shared by the tx subcommands. Pure + testable.
// `--key value` → { key: 'value' }; a bare `--flag` (or one followed by another
// `--flag`) → { flag: true }.
export type Flags = Record<string, string | boolean>

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }
  return flags
}

/** Convenience: a flag's string value, or undefined if it's a boolean/absent. */
export const flagStr = (v: string | boolean | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined
