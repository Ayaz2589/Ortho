// Pure, runtime-agnostic base64 (spec 028). The core compiles with lib ES2022 and
// `types: []`, so neither Node's Buffer nor the Web's atob/btoa are available as types.
// SimpleFIN setup tokens are base64-encoded ASCII URLs, and Basic-Auth credentials are
// ASCII — so an ASCII/Latin1 codec is sufficient and fully deterministic/testable.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP: Record<string, number> = {}
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charAt(i)] = i

/** Encode an ASCII/Latin1 string to standard base64. */
export function base64Encode(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input.charCodeAt(i) & 0xff
    const hasB1 = i + 1 < input.length
    const hasB2 = i + 2 < input.length
    const b1 = hasB1 ? input.charCodeAt(i + 1) & 0xff : 0
    const b2 = hasB2 ? input.charCodeAt(i + 2) & 0xff : 0
    out += ALPHABET.charAt(b0 >> 2)
    out += ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4))
    out += hasB1 ? ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) : '='
    out += hasB2 ? ALPHABET.charAt(b2 & 0x3f) : '='
  }
  return out
}

/** Decode standard or URL-safe base64 (with or without padding) to an ASCII/Latin1
 *  string. Returns null on any invalid character so callers can reject cleanly. */
export function base64Decode(input: string): string | null {
  // Accept URL-safe variants and tolerate missing padding / surrounding whitespace.
  const clean = input.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/g, '')
  let out = ''
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    const val = LOOKUP[ch]
    if (val === undefined) return null
    buffer = (buffer << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return out
}
