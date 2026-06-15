// Read a statement into page-text the profiles can detect/parse. PDFs go through
// unpdf (extractText); CSVs are read as text and returned as a single "page".
import { readFile } from 'node:fs/promises'
import { extractText } from './extractText'

export async function readInput(path: string): Promise<string[]> {
  if (path.toLowerCase().endsWith('.csv')) {
    const text = await readFile(path, 'utf8')
    if (!text.trim()) throw new Error('UNPARSEABLE_INPUT: empty CSV')
    return [text]
  }
  return extractText(path)
}
