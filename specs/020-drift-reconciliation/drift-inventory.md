# Ortho Drift Inventory (audit wf_c3eddd07-b2d, 2026-07-07)

41 distinct drifts (14 known + 27 new). Adversarially verified (46/47 candidates confirmed).
Severity: **H**=real defect/data-loss, **M**=user-visible or behavior gap, **L**=cosmetic/doc lag.

## Group 1 — CLI import data-contract & dead-knob cleanup
| id | sev | file | fix |
|---|---|---|---|
| cli-paid-by | H | web/scripts/import/db/persist.ts:8 | Add `paid_by: tx.paid_by ?? null` to txRecord (all CLI write paths); correct PARITY.md row 5. CLI expenses currently land paid_by=NULL and are dropped by settle-up. |
| scope-dead-knob | M | Makefile:44 | Remove `--scope` forward + docs/makefile.md:197 + README.md:68,80 personal/shared language (scope dropped in migration 6; tx.ts never parses it). |
| asuserid-dead-option | L | web/scripts/import/db/client.ts:45,64 | Delete `asUserId` field + `?? ''` branch (never passed). |

## Group 2 — Config source-of-truth truth-up
| id | sev | file | fix |
|---|---|---|---|
| otp-length-config | H | supabase/config.toml:227 | Set otp_length=8 to match every client/doc (6 makes local sign-in unenterable — clients hard-gate ≥8). |
| seed-sql-missing | L | supabase/config.toml:62,65 | [db.seed] enabled=true points at missing ./seed.sql — add the file or disable the block. |

## Group 3 — Money/currency & insights formatter parity (TS↔Swift, vector-blind)
| id | sev | file | fix |
|---|---|---|---|
| insights-money-decimals | M | web/lib/finance/insights.ts:14 | web drops decimals on whole dollars ($400), iOS forces 2 ($400.00). Set web min=2; fix comment; add title/body assertion. |
| currency-symbol-source | M | web/lib/finance/money.ts:7 | CNY: web hardcoded '¥' vs iOS locale-derived 'CN¥'. Align + add currency-symbol vector. |
| currency-gbp-name | M | web/lib/finance/currency.ts:12 | GBP name web 'British Pound' vs iOS 'UK Pound'. Align + vector names. |
| money-negative-sign | L | iOS Money.swift:15 | iOS drops '−' (formats magnitude); web prepends U+2212. Latent (callers abs). Align. |
| money-leadingplus-zero | L | web/lib/finance/money.ts:68 | '+' on zero: iOS '+$0.00' vs web '$0.00'. Align leadingPlus gate. |
| money-tousdcents-rate-guard | L | web/lib/finance/money.ts:87 | Guard `rate===0` (web) vs `rate>0` (iOS) — diverge on negative rate. Change web to `rate<=0`. |
| splits-sharepercent-rounding | L | web/lib/splits.ts:110 | Negative half-values: JS Math.round (half-up) vs Swift away-from-zero. Align; fix "cannot diverge" header. |
| lease-duedate-overflow | M | web/components/housing/lease.ts:9 | iOS daysUntilNextRent doesn't clamp due-day 31 → overflows to next month (off-by-1). Clamp in Swift; add lease vector (lease has NO vector). |

## Group 4 — Filter/query/sort parity (TS↔Swift, vector-blind)
| id | sev | file | fix |
|---|---|---|---|
| filters-monthbounds-parse | L | iOS TransactionFilters.swift:82 | iOS accepts '2026-5'/'26-5'; web regex-validates yyyy-MM. Add strict validation to iOS monthBounds. |
| filters-query-trim-charset | L | iOS TransactionFilters.swift:30,62 | JS trim() strips newlines, Swift .whitespaces doesn't. Use .whitespacesAndNewlines. |
| filters-availablesources-sort | L | iOS TransactionFilters.swift:78 | web localeCompare vs iOS Unicode-scalar sort → chip order differs. Use localized case-insensitive comparator. |

## Group 5 — Dashboard aggregate wiring & housing occupancy (schema-touching)
| id | sev | file | fix |
|---|---|---|---|
| aggregate-rpcs-not-wired | M | web/lib/api/aggregates.ts:1 | RPC wrappers exist but widgets compute client-side. Wire them OR delete wrappers + update PARITY/docs. |
| vacant-occupied-toggle | M | web AddPropertyModal.tsx / iOS AddPropertySheet.swift | Add `occupied` column (migration) + explicit toggle on both surfaces; replace blank-tenant inference (completes 019 US5). |
| total-unit-rent-copy | M | web AddPropertyModal.tsx:233 / iOS AddPropertySheet.swift:246 | Copy "total unit rent" → "occupied unit rent" (+ xcstrings); net is occupied-only post-019. |

## Group 6 — i18n catalog parity & lock hardening
| id | sev | file | fix |
|---|---|---|---|
| i18n-webonly-block-mislabel | M | web/lib/i18n/es.ts:263 (+all 5) | ~34 iOS-shared keys sit below the "web-only" marker; catalog-parity.test.ts never asserts disjointness. Move keys above marker + harden the lock. |
| i18n-es-catalog-divergence | L | web/lib/i18n/es.ts:268 | es misplaces Color/Total below marker + omits Euro/Local/Personal vs the other 4 catalogs. Reconcile. |

## Group 7 — Obsolete-schema comments & spec cleanup
| id | sev | file | fix |
|---|---|---|---|
| txapi-scope-percent-comment | L | iOS TransactionsAPI.swift:44-48,85-89 | Doc comments still describe dropped scope/percent columns. Rewrite to person_id/amount_cents. |
| tasks-md-stale-schema | L | iOS/Tasks.md:217-218 | Data-model still says percent/user_id shares, scope, expense\|income-only. Update to current schema + transfer kind. |
| architecture-md-stale | L | iOS/ARCHITECTURE.md:506,514 | Pre-Supabase prototype doc (Set<User.ID> ownership). Rewrite data-layer/feature-status or mark archived. |

## Group 8 — Documentation & count refresh (zero runtime risk)
| id | sev | file | fix |
|---|---|---|---|
| docs-index-active-feature-014 | M | docs/index.md:77 | 014 → 019 active-feature pointer. |
| docs-makefile-plan-014 | M | docs/makefile.md:127,176-177 | 014 → 019 plan/feature.json refs. |
| docs-seven-vs-eight-vectors | M | docs/index.md:50, docs/shared.md:5,70,140 | "seven" → "eight" vectors; drop "eighth is future work". |
| docs-ios-appstate-lines | L | docs/ios.md:105 | ~1,260 → ~1,360. |
| docs-ios-test-suites | L | docs/ios.md:87,237 | 7 → 10 suites (+HousingNetRental, FeatureFlags, ScanParser). |
| docs-ios-config-folder | L | docs/ios.md:57 | Add Config/ (FeatureFlags.swift, TestBuild.swift) to tree. |
| docs-ios-scancameraview | L | docs/ios.md | ScanCameraView → file ScanCaptureView.swift. |
| docs-ios-scan-fallback-screenshot | L | docs/ios.md:220 | Add 'fallback' scan-screenshot suffix (ios-ci.yml:139). |
| docs-web-test-count | L | docs/web.md:91,173 | 67 → 72 test files (re-confirm 731). |
| docs-web-txform-lines | L | docs/web.md:152 | TxForm.tsx 637 → 839. |
| docs-web-tree-omissions | L | docs/web.md §3 | Add housing.ts, useFocusTrap.ts, rate.ts, kinds.ts, flags.ts, test-build.ts, testdata/. |
| readme-vectors-4of8-xcode | L | shared/test-vectors/README.md:56 | Document all 8 vectors; drop "pending Copy-Bundle setup". |
| readme-splits-shape-incomplete | L | shared/test-vectors/README.md:27 | splits shape {cases,validations} → {cases,validations,seeds,ownerOrdering}. |
| docs-shared-splits-linecount | L | docs/shared.md:33 | transaction-splits.json 516 → 535 ln. |
| docs-makefile-feature-count | L | docs/makefile.md:49,131 | "15 features 001-015" → "16, latest 019, non-sequential". |
| import-readme-ownermatch | L | web/scripts/import/README.md:94 | Add ownerMatch.ts to engine module list. |
| tasks-019-t026-t027 | L | specs/019-housing-parity-fixes/tasks.md:145-146 | Check off T026/T027 (done — merged PR #10). |

## Cross-cutting notes
- iOS cannot build locally (Linux) — Swift changes validate only via ios-ci.yml.
- Parity fixes that touch a vectored engine → regen `npm run gen:vectors` + mirror Swift; NEW vector file needs iOS pbxproj Copy-Bundle entry.
- Group 5 vacant/occupied is the ONLY schema migration.
- Group 6 touches the catalog-parity lock; new iOS strings need xcstrings + shouldTranslate handling.
- Reconcile PARITY.md wherever a fix changes a matrix cell.
