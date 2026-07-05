# Contract: Invite-Code Convention (cross-surface, hand-mirrored)

**Status**: authoritative for `web/lib/invites.ts` ↔ `iOS/Ortho-iOS/Shared/InviteCodec.swift`
and the operator scripts. This is a **convention mirror** (like spec-014's ScanHeuristics
tables), locked by identical literal test cases in both suites — deliberately NOT a golden
vector (no money/date math; see research.md R2).

A code minted on either surface MUST redeem on both surfaces and against the live
`accept_invite` RPC.

## 1. Alphabet & shape

- Alphabet (Crockford base32): `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (32 symbols; I, L, O, U excluded).
- Canonical code: exactly **10** alphabet characters (≈50 bits entropy).
- Display format: `XXXXX-XXXXX` (one hyphen after the 5th character). Display is derived; the
  canonical form is the identity.

## 2. Generation

- Source: a cryptographically secure RNG only (`crypto.getRandomValues` on web;
  `SystemRandomNumberGenerator` on iOS).
- Mapping: each output symbol = `alphabet[byte & 31]` over 10 CSPRNG bytes (bias-free — 32
  divides 256).
- The generator returns the CANONICAL form; UI applies `format` for display.

## 3. Canonicalization (applied to ALL user input on BOTH create-side hashing and redeem)

```
canonicalize(input):
  s = uppercase(input)
  s = s.replace('O'→'0', 'I'→'1', 'L'→'1')
  s = strip every character not in [0-9A-Z]
  return s
```

- No length check inside `canonicalize` (callers validate `length == 10` for UX, but the
  RPC's hash lookup is the real gate).
- `U` is not produced by generation and is NOT mapped; a typed `U` simply yields a code that
  hashes to nothing (standard invalid-code path).

## 4. Hashing

- `token_hash = lowercasehex( SHA-256( UTF-8 bytes of canonical string ) )` — 64 hex chars.
- This must equal Postgres `encode(digest(p_token, 'sha256'), 'hex')` where `p_token` is the
  canonical string — therefore clients MUST pass the **canonical** string to
  `rpc('accept_invite', { p_token })`, never the display form.

## 5. Join link (web-minted; consumed by web)

`{origin}/join?code=XXXXX-XXXXX` — the `code` query value may be display- or canonical-form;
the consumer canonicalizes (rule 3). iOS does not register a URL scheme for this feature
(out of scope); iOS users type/paste the code.

## 6. Shared literal test cases (MUST appear verbatim in BOTH test suites)

| # | case | input | expected |
|---|---|---|---|
| T1 | canonicalize strips + upcases | `"abcde-23456"` | `"ABCDE23456"` |
| T2 | confusable mapping | `"oil0-o1ilo"` | `"011001110"` (worked below) |
| T3 | hash of known canonical | `"ABCDE23456"` | `sha256hex = "f2b6d33ab9deae9d4d8ee1417a5b1a09fd63ffcecc4b0714414571f0b7d5c700"` |
| T4 | format | `"ABCDE23456"` | `"ABCDE-23456"` |
| T5 | round-trip | `canonicalize(format(g)) == g` for generated `g` | property |

**T2 resolved precisely**: `canonicalize("oil0-o1ilo")` — mapping per rule 3:
`O→0, I→1, L→1` then strip: `"o","i","l","0","o","1","i","l","o"` →
`"0","1","1","0","0","1","1","1","0"` = `"011001110"` (9 chars — hyphen stripped).
Suites assert the exact string `"011001110"`.

**T3 verification**: both suites must assert the same 64-char literal; compute once during
implementation (web `hashInviteCode('ABCDE23456')`), paste into BOTH files with a comment
naming this contract. (The value above is a placeholder until computed — the implementing
task MUST replace it in this file AND both tests with the real digest and they MUST match.)

## 7. Expiry & status (client-derived, no storage)

- `expires_at = creation instant + 7 * 24h` (exact; no calendar rounding).
- Status precedence: `redeemed` (redeemed_at present) → `expired` (expires_at ≤ now) →
  `pending`. Both surfaces use injected `now` in tests.

## 8. Change control

Any change to alphabet/length/canonicalization/hash BREAKS cross-surface redemption of
outstanding codes. Such a change requires: updating this contract, BOTH implementations,
BOTH literal test tables in the same change, and a PARITY.md note. (Outstanding pending
invites minted under the old convention die at their 7-day expiry — acceptable.)
