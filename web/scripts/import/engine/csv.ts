// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas, and
// doubled "" escapes). Pure. Blank lines are skipped.
// Also exports shared merchant-cleaning and date-parsing helpers used by all
// CSV bank profiles so they stay in one place instead of copy-pasted per file.

export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Parse CSV text into rows of fields (header included as row 0). */
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map(parseCsvLine)
}

/** Title-case a merchant description (lower → capitalize each word). */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Strip transaction reference noise (e.g. *REF1234) then title-case. */
export function cleanMerchant(desc: string): string {
  const stripped = desc.replace(/\*[A-Za-z0-9]{4,}\b/g, '').replace(/\s+/g, ' ').trim()
  return titleCase(stripped || desc)
}

/** Parse MM/DD/YYYY → ISO noon-UTC timestamp. Throws on bad input. */
export function parseMMDDYYYY(s: string, bankId = 'CSV'): string {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error(`${bankId.toUpperCase()}_BAD_DATE: ${JSON.stringify(s)}`)
  return `${m[3]}-${m[1]}-${m[2]}T12:00:00.000Z`
}

/** Parse YYYY-MM-DD → ISO noon-UTC timestamp. Throws on bad input. */
export function parseYYYYMMDD(s: string, bankId = 'CSV'): string {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error(`${bankId.toUpperCase()}_BAD_DATE: ${JSON.stringify(s)}`)
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`
}
