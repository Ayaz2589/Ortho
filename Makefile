# Ortho — developer make targets.
# Bank-statement import CLI (see specs/004-bank-statement-import).

WEB := web
CLI := scripts/import/cli.ts
TX := scripts/import/tx.ts

.PHONY: ingest ingest-help tx-list tx-add tx-edit tx-rm

# Import a bank-statement PDF into the database.
#   make ingest FILE=<path.pdf> [BANK=td] [DRY_RUN=1] [YES=1] [ADMIN=1]
# FILE is resolved to an absolute path so it survives the `cd web`.
ingest:
	@test -n "$(FILE)" || { echo 'Usage: make ingest FILE=<path.pdf> [BANK=td] [DRY_RUN=1] [YES=1] [ADMIN=1]'; exit 1; }
	@abs="$$(cd "$$(dirname "$(FILE)")" && pwd)/$$(basename "$(FILE)")"; \
	  cd $(WEB) && npx tsx $(CLI) --file "$$abs" $(if $(BANK),--bank $(BANK)) $(if $(filter 1,$(DRY_RUN)),--dry-run) $(if $(filter 1,$(YES)),--yes) $(if $(filter 1,$(ADMIN)),--admin)

ingest-help:
	@echo 'Bank-statement import CLI'
	@echo ''
	@echo 'Usage: make ingest FILE=<statement.pdf|csv> [BANK=<id>] [DRY_RUN=1] [YES=1] [ADMIN=1]'
	@echo ''
	@echo '  FILE      path to the statement PDF or CSV (required)'
	@echo '  BANK      force a bank profile id (td|apple|amex|chase); default = auto-detect'
	@echo '  DRY_RUN=1 parse + preview + reconcile, no DB writes'
	@echo '  YES=1     skip the per-row review (accept suggestions); still confirms before writing'
	@echo '  ADMIN=1   use SUPABASE_SERVICE_ROLE_KEY instead of sign-in'
	@echo ''
	@echo 'Env (web/.env.local): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,'
	@echo '  IMPORT_EMAIL (sign-in; emails an 8-digit OTP code you enter at the prompt — no password);'
	@echo '  SUPABASE_SERVICE_ROLE_KEY (ADMIN=1 only)'

# Transaction CRUD (see specs/005-transaction-crud-cli). Same OTP/ADMIN auth as ingest.
# List your transactions (read-only):
#   make tx-list [MONTH=YYYY-MM] [CATEGORY=..] [SOURCE=..] [SCOPE=personal|shared] [KIND=expense|income] [LIMIT=N] [ADMIN=1]
tx-list:
	cd $(WEB) && npx tsx $(TX) list $(if $(MONTH),--month '$(MONTH)') $(if $(CATEGORY),--category '$(CATEGORY)') $(if $(SOURCE),--source '$(SOURCE)') $(if $(SCOPE),--scope '$(SCOPE)') $(if $(KIND),--kind '$(KIND)') $(if $(LIMIT),--limit '$(LIMIT)') $(if $(filter 1,$(ADMIN)),--admin)

# Create one transaction:
#   make tx-add MERCHANT='..' AMOUNT='12.34' [DATE=YYYY-MM-DD] [CATEGORY=..] [KIND=..] [SCOPE=..] [SOURCE='..'] [ADMIN=1]
tx-add:
	cd $(WEB) && npx tsx $(TX) add $(if $(MERCHANT),--merchant '$(MERCHANT)') $(if $(AMOUNT),--amount '$(AMOUNT)') $(if $(DATE),--date '$(DATE)') $(if $(CATEGORY),--category '$(CATEGORY)') $(if $(KIND),--kind '$(KIND)') $(if $(SCOPE),--scope '$(SCOPE)') $(if $(SOURCE),--source '$(SOURCE)') $(if $(filter 1,$(ADMIN)),--admin)

# Edit one transaction interactively:
#   make tx-edit ID=<uuid> [ADMIN=1]
tx-edit:
	@test -n "$(ID)" || { echo 'Usage: make tx-edit ID=<uuid> [ADMIN=1]'; exit 1; }
	cd $(WEB) && npx tsx $(TX) edit --id '$(ID)' $(if $(filter 1,$(ADMIN)),--admin)

# Delete one transaction (DRY_RUN previews):
#   make tx-rm ID=<uuid> [DRY_RUN=1] [ADMIN=1]
tx-rm:
	@test -n "$(ID)" || { echo 'Usage: make tx-rm ID=<uuid> [DRY_RUN=1] [ADMIN=1]'; exit 1; }
	cd $(WEB) && npx tsx $(TX) rm --id '$(ID)' $(if $(filter 1,$(DRY_RUN)),--dry-run) $(if $(filter 1,$(ADMIN)),--admin)
