// Public surface of @ortho/aggregation-core (spec 024 + spec 028).
// See README.md for the extraction contract.
export type {
  AggregationErrorCode,
  LinkedInstitutionStatus,
  LinkedProvider,
  LinkMode,
  NormalizedAccount,
  ParsedSimpleFinAccounts,
  SimpleFinAccountMeta,
  SimpleFinTransaction,
  TransactionKind,
} from './types.ts'

// ── SimpleFIN provider (spec 028) — the go-forward bank-sync provider ──
export { base64Decode, base64Encode } from './base64.ts'
export {
  amountToCents,
  dedupeKey,
  hash128Hex,
  hexToUuid,
  ledgerId,
  type NormalizedAmount,
} from './normalize.ts'
export {
  buildAccountsQuery,
  buildSyncWindow,
  decodeSetupToken,
  deriveProviderItemId,
  institutionLabel,
  MAX_WINDOW_SECONDS,
  parseSimpleFinAccounts,
  SYNC_OVERLAP_SECONDS,
  toUpsertPayload,
  type UpsertContext,
  type UpsertPayload,
} from './simplefin.ts'
export {
  createSimpleFinClient,
  parseAccessUrl,
  type SimpleFinClient,
  type SimpleFinFailure,
  type SimpleFinFetch,
  type SimpleFinResult,
} from './simplefinClient.ts'
// Plaid provider — @deprecated (spec 028): contained under ./deprecated/, kept
// fully wired as a rollback path. Re-exported here so the plaid-* edge functions
// and web client keep importing the barrel unchanged. SimpleFIN is the go-forward
// provider (see the SimpleFIN exports below).
export {
  createPlaidClient,
  PLAID_API_VERSION,
  PLAID_BASE_URLS,
} from './deprecated/plaidClient.ts'
export {
  buildLinkTokenRequest,
  HOSTED_COMPLETION_REDIRECT_URI,
  interpretItemRemoveResult,
  OAUTH_RETURN_PATH,
  parseAccountsResponse,
  parseExchangeResponse,
  parseHostedSessionResult,
  parseInstitutionResponse,
  parseLinkTokenResponse,
} from './deprecated/plaid.ts'
export type {
  ItemRemoveOutcome,
  LinkTokenRequestOptions,
  ParsedAccounts,
  ParsedExchange,
  ParsedLinkToken,
} from './deprecated/plaid.ts'
export type {
  FetchLike,
  PlaidClient,
  PlaidConfig,
  PlaidEnv,
  PlaidFailure,
  PlaidResult,
} from './deprecated/plaidClient.ts'
