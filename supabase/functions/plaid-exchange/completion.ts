// Pure decision for the post-`complete_plaid_link` outcome, extracted so the
// "committed-but-response-lost" recovery is explicit and regression-locked.
//
// A truthy rpcError from supabase-js does NOT prove the transaction rolled back:
// the RPC's Postgres transaction can COMMIT and only the PostgREST response be
// lost (network blip/timeout). Blindly compensating in that case would
// /item/remove the token the RPC just stored, revoking a freshly-linked bank and
// leaving a ghost 'active' institution. The session's atomic flip to 'completed'
// (written inside the same transaction, specific to THIS attempt) is the precise
// commit signal — correct for both new links and re-links, unlike checking
// whether an institution row merely exists.

export type SessionRecheck = {
  status?: string | null
  institutionId?: string | null
}

export type CompletionDecision =
  | { outcome: 'success'; institutionId: string }
  | { outcome: 'compensate' }

/**
 * Decide the outcome after a failed/ambiguous complete_plaid_link RPC, given a
 * fresh re-read of the session. Treat as success ONLY when the session flipped
 * to 'completed' with an institution id — proof the atomic transaction landed.
 */
export function decideCompletionAfterRpcError(recheck: SessionRecheck | null): CompletionDecision {
  if (
    recheck &&
    recheck.status === 'completed' &&
    typeof recheck.institutionId === 'string' &&
    recheck.institutionId.length > 0
  ) {
    return { outcome: 'success', institutionId: recheck.institutionId }
  }
  return { outcome: 'compensate' }
}
