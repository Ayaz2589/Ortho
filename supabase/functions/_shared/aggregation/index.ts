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
export type {
  FetchLike,
  PlaidClient,
  PlaidConfig,
  PlaidEnv,
  PlaidFailure,
  PlaidResult,
} from './plaidClient.ts'
