# Phase 1 Data Model

No database schema changes. This records the affected logical entities and the auth-config change.

## Entities

- **Session** — a person's authenticated context on a single client (iOS or web). After this feature:
  - **Independent per client**: there is no cross-client lock; two sessions (iOS + web) coexist for the
    same person, and ending one does not end the other.
  - **Bounded lifetime**: a maximum of **30 days from sign-in** (enforced by the auth provider's session
    timebox = `720h`). Past 30 days the session is invalid; the next launch/navigation/refresh on the
    client signs the person out → sign-in.
  - Restore/refresh of a *valid* (<30-day) session is unchanged (cold launch → data).

- **Single-active-platform lock** (`platform_locks` table) — **retired**. No client reads, claims,
  releases, or yields to it. The table and its RLS policies remain in the database (unused); the web
  `PlatformLock` TypeScript type remains defined but unreferenced. Kept so the change is reversible
  without a migration.

## Config change (not schema)

- `supabase/config.toml` → `[auth.sessions] timebox = "720h"` (30 days). The **production** project must
  enable the same setting; that is the enforcement point for the 30-day cap.

## Pure functions / vectors

None. This feature changes auth flow and config only — it touches no finance/date pure functions, so
`shared/test-vectors/*` are unaffected and unchanged.
