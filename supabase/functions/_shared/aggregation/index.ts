// Public surface of @ortho/aggregation-core (spec 024).
// See README.md for the extraction contract.
export type {
  AggregationErrorCode,
  LinkedInstitutionStatus,
  LinkedProvider,
  LinkMode,
  NormalizedAccount,
} from './types.ts'
export {
  createPlaidClient,
  PLAID_API_VERSION,
  PLAID_BASE_URLS,
} from './plaidClient.ts'
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
} from './plaid.ts'
export type {
  ItemRemoveOutcome,
  LinkTokenRequestOptions,
  ParsedAccounts,
  ParsedExchange,
  ParsedLinkToken,
} from './plaid.ts'
export type {
  FetchLike,
  PlaidClient,
  PlaidConfig,
  PlaidEnv,
  PlaidFailure,
  PlaidResult,
} from './plaidClient.ts'
