'use client'

/**
 * Spec 017 US2/FR-009 — /join?code=… for a signed-in user who already belongs
 * to a household (a brand-new user never reaches this page: the shell's
 * HouseholdGate replaces all (app) content and consumes the code itself).
 * Joining is always an explicit act — the code is shown for confirmation and
 * redeemed only on the button press.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { PrimaryButton } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { PageHeader } from '@/components/ui'

type JoinFailure = 'invalid' | 'already-member' | 'load-failed'

export default function JoinPage() {
  const router = useRouter()
  const { redeemInvite, t } = useApp()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<JoinFailure | null>(null)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code')
    if (fromUrl) setCode(fromUrl)
  }, [])

  const join = async () => {
    if (busy || code.trim() === '') return
    setBusy(true)
    setFailure(null)
    const result = await redeemInvite(code)
    setBusy(false)
    if (result.ok) {
      router.replace('/dashboard')
      return
    }
    setFailure(result.reason)
  }

  const failureCopy =
    failure === 'invalid'
      ? t('That code is invalid, already used, or expired.')
      : failure === 'already-member'
        ? t("You're already a member of this household.")
        : failure === 'load-failed'
          ? t("You've joined, but loading failed. Try signing in again.")
          : null

  return (
    <ReadingColumn>
      <PageHeader title={t('Join a household')} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void join()
        }}
        className="flex max-w-sm flex-col gap-4"
      >
        <p className="text-sm text-text-2">
          {t('Joining a household switches this device to its shared ledger. Your own data stays put.')}
        </p>
        <input
          aria-label={t('Invite code')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCDE-23456"
          className="rounded-xl border border-hairline bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.2em] text-text outline-none focus:border-accent"
        />
        {failureCopy && <p className="text-sm text-text-2">{failureCopy}</p>}
        <PrimaryButton type="submit" disabled={code.trim() === '' || busy}>
          {busy ? t('Joining…') : t('Join')}
        </PrimaryButton>
      </form>
    </ReadingColumn>
  )
}
