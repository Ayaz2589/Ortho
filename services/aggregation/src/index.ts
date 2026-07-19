// Public surface of @ortho/aggregation-core (spec 024).
// See README.md for the extraction contract.
export type {
  AggregationErrorCode,
  LinkedInstitutionStatus,
  LinkedProvider,
  LinkMode,
  NormalizedAccount,
} from './types.ts'
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
