// spec 032 — read the embedded envelope back out of an exported PDF.
//
// pdf-lib cannot read attachments it wrote, so we use unpdf's serverless pdf.js
// (`getAttachments()`), which runs headlessly in node — making the full
// export→import round-trip unit-testable. Reads ONLY the machine-readable
// attachment; never scrapes the visible text. Performs no writes.

import { getResolvedPDFJS } from 'unpdf'
import { ATTACHMENT_NAME, validateEnvelope, type ValidateResult } from './envelope'

/**
 * Extract + validate the Ortho envelope from PDF bytes. Returns a typed reason
 * on every failure path (`not-ortho-file` | `unsupported-version` | `corrupt`)
 * so the importer can make zero changes and explain why.
 */
export async function readEnvelope(bytes: Uint8Array): Promise<ValidateResult> {
  let attachments: Record<string, { filename: string; content: Uint8Array }> | null | undefined
  try {
    const { getDocument } = await getResolvedPDFJS()
    const pdf = await getDocument(new Uint8Array(bytes)).promise
    attachments = await pdf.getAttachments()
  } catch {
    return { ok: false, reason: 'corrupt' }
  }

  const entry = attachments?.[ATTACHMENT_NAME]
  if (!entry) return { ok: false, reason: 'not-ortho-file' }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(entry.content))
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  return validateEnvelope(parsed)
}
