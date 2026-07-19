'use client'

/**
 * The embedded Plaid Link runner (spec 024, web only — the iOS shell uses
 * Hosted Link in the external browser instead). Renders nothing: it exists to
 * host usePlaidLink and auto-open once the CDN script is ready. Loaded via
 * next/dynamic so react-plaid-link (and Plaid's cdn script loader) never
 * enters the initial bundle for members who don't open Linked banks.
 *
 * @deprecated (spec 028) — Plaid is CONTAINED, not removed. SimpleFIN
 * (SimpleFinConnect.tsx) is the go-forward connect method; this Plaid runner is
 * kept fully wired as a rollback path.
 */
import { useEffect } from 'react'
import { usePlaidLink } from 'react-plaid-link'

export default function EmbeddedPlaidLink({
  token,
  receivedRedirectUri,
  onSuccess,
  onExit,
}: {
  token: string
  /** Set on the OAuth return route only: resumes the SAME Link session. */
  receivedRedirectUri?: string
  onSuccess: (publicToken: string) => void
  onExit: () => void
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: (publicToken: string) => onSuccess(publicToken),
    onExit: () => onExit(),
    ...(receivedRedirectUri !== undefined ? { receivedRedirectUri } : {}),
  })

  useEffect(() => {
    if (ready) open()
  }, [ready, open])

  return null
}
