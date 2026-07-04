# Contract: `-uiDemoScan` launch argument & CI screenshots

**Purpose**: make the whole scan flow verifiable from Linux sandboxes via CI simulator
screenshots (spec US4). DEBUG-only, compiled out of release like `-uiDemo` (FR-021).

## Launch arguments (DEBUG builds only)

| Argument | Effect |
|---|---|
| `-uiDemoScan <fixtureName>` | Implies `-uiDemo` (demo data, no auth). Loads `Resources/ScanFixtures/<fixtureName>.(png\|pdf)`, runs the REAL extractor → parser → inference pipeline against the demo transaction history, opens the Transactions tab with AddTransactionSheet presented and the session applied: receipt fixture ⇒ prefilled form (guess markers visible); statement fixture ⇒ interstitial. |
| `-uiDemoScanStep <interstitial\|row\|summary>` | Statement fixtures only; advances the session deterministically for screenshots: `interstitial` (default), `row` (Start review pressed, wizard on row 1), `summary` (all rows auto-accepted through the demo add path, summary showing). |
| `-uiDemoLanguage <code>` | Existing argument; composes — scan screens render in that language. |

Rules:
- The pipeline run is the production code path (no mock parse results) — the ONLY
  demo-mode substitutions are the fixture input, the demo in-memory store, and an
  injected reference date (determinism; constitution VI).
- `ScanRefiner` (Foundation Models) is DISABLED under `-uiDemoScan` — simulators lack
  the model and screenshots must be deterministic (heuristic baseline is what's shown).
- Unknown fixture name ⇒ assertionFailure in DEBUG (fail loud in CI logs).
- Release builds: arguments inert; symbol-stripped via `#if DEBUG`.

## CI screenshot matrix additions (`.github/workflows/ios-ci.yml`)

Existing per-language matrix gains scan shots, named `<lang>-scan-<screen>.png`:

| Screen | Launch | Languages |
|---|---|---|
| `receipt` (prefilled form + guessed markers + duplicate line fixture) | `-uiDemoScan receipt-duplicate` | en + all 5 others (dashboard-tier coverage: en/bn/es/ja/zh-Hans/ko) |
| `interstitial` | `-uiDemoScan statement-card` | en, bn, ja (the existing four-tab-tier languages) |
| `row` (wizard row 1) | `-uiDemoScan statement-card -uiDemoScanStep row` | en, bn, ja |
| `summary` | `-uiDemoScan statement-card -uiDemoScanStep summary` | en, bn, ja |

Acceptance (SC-006): every shot fully translated (no raw keys, no tofu), Latin digits
in বাংলা, no clipped/overflowing controls at the CI simulator's width.

## What CI cannot cover (operator-verified on a Mac, explicitly out of scope here)

- Live camera capture, PhotosPicker, fileImporter system sheets.
- Camera permission prompt & denial path.
- Foundation Models refinement quality on Apple-Intelligence hardware.
