'use client'

/**
 * Spec 017 US2 — the household gate. Rendered by the app shell INSTEAD of tab
 * content when the signed-in user belongs to no household
 * (`membershipStatus === 'none'`): an explicit "Join with a code / Start
 * fresh" choice replaces the old silent find-or-create (FR-008). A `?code=`
 * query value (the /join link) pre-fills the join form.
 *
 * Calm by construction: one heading, two real buttons, a quiet sign-out —
 * failures are single plain sentences, never alarmist.
 */
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { PrimaryButton, Avatar } from '@/components/ui'

type JoinFailure = 'invalid' | 'already-member' | 'load-failed'

export function HouseholdGate() {
  const {
    currentUserEmail,
    currentHousehold,
    error,
    membershipStatus,
    needsPersonClaim,
    people,
    startFresh,
    redeemInvite,
    claimPerson,
    resolveUser,
    signOut,
    t,
  } = useApp()
  const [mode, setMode] = useState<'choice' | 'join'>('choice')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<JoinFailure | null>(null)
  const [claimTaken, setClaimTaken] = useState(false)
  const [newPersonMode, setNewPersonMode] = useState(false)
  const [newName, setNewName] = useState('')

  // One-shot /join?code= pre-fill (FR-009). Read imperatively — the gate can
  // mount on any route, and the code is consumed once.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code')
    if (fromUrl) {
      setCode(fromUrl)
      setMode('join')
    }
  }, [])

  const join = async () => {
    if (busy || code.trim() === '') return
    setBusy(true)
    setFailure(null)
    const result = await redeemInvite(code)
    setBusy(false)
    if (!result.ok) setFailure(result.reason)
    // Success needs no navigation: the shell swaps to tab content when
    // membershipStatus flips to 'member'.
  }

  const fresh = async () => {
    if (busy) return
    setBusy(true)
    await startFresh()
    setBusy(false)
  }

  const failureCopy =
    failure === 'invalid'
      ? t('That code is invalid, already used, or expired.')
      : failure === 'already-member'
        ? t("You're already a member of this household.")
        : failure === 'load-failed'
          ? t("You've joined, but loading failed. Try signing in again.")
          : null

  // ---- identity claim (US3): shown INSTEAD of the join/start-fresh choice
  // once the user is a member but not yet linked to a roster person.
  if (membershipStatus === 'member' && needsPersonClaim) {
    const claimable = people.filter((p) => p.linked_user_id === null)
    const claim = async (personId: string) => {
      if (busy) return
      setBusy(true)
      setClaimTaken(false)
      const result = await claimPerson({ personId })
      setBusy(false)
      if (!result.ok && result.reason === 'taken') setClaimTaken(true)
    }
    const claimNew = async () => {
      if (busy || newName.trim() === '') return
      setBusy(true)
      await claimPerson({ name: newName })
      setBusy(false)
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h2 className="text-lg font-normal text-text">{t('Who are you in this household?')}</h2>
            <p className="mt-1 text-sm text-text-2">
              {t('Pick your name and everything already recorded for it — splits, balances, history — becomes yours.')}
            </p>
            {currentHousehold?.name && (
              <p className="mt-1 text-xs text-text-3">{currentHousehold.name}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {claimable.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={p.name}
                onClick={() => void claim(p.id)}
                disabled={busy}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-left text-[15px] text-text disabled:opacity-40"
              >
                <Avatar user={resolveUser(p.id)} size={28} />
                {p.name}
              </button>
            ))}
            {claimTaken && (
              <p className="text-sm text-text-2">{t('Someone else just claimed that name. Pick another.')}</p>
            )}
            {newPersonMode ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void claimNew()
                }}
                className="flex flex-col gap-2"
              >
                <input
                  aria-label={t('Your name')}
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('Your name')}
                  className="rounded-xl border border-hairline bg-surface px-4 py-3 text-text outline-none focus:border-accent"
                />
                <PrimaryButton type="submit" disabled={newName.trim() === '' || busy}>
                  {t('Continue')}
                </PrimaryButton>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setNewPersonMode(true)}
                disabled={busy}
                className="rounded-xl px-4 py-3 text-center text-[14px] text-accent"
              >
                {t('Continue as a new person')}
              </button>
            )}
          </div>
          <div className="mt-10 flex flex-col items-center gap-1 text-center">
            {currentUserEmail && <span className="text-xs text-text-3">{currentUserEmail}</span>}
            <button type="button" onClick={() => void signOut()} className="text-xs text-text-2">
              {t('Sign out')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-text text-2xl font-light text-bg">
            O
          </div>
          <h1 className="text-2xl font-light tracking-tight text-text">Ortho</h1>
          <p className="mt-1 text-sm text-text-2">{t('Household finance, in order.')}</p>
        </div>

        {mode === 'choice' ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-normal text-text">{t("You're signed in — but not part of a household yet.")}</h2>
            <p className="-mt-2 text-sm text-text-2">
              {t('Join your partner with an invite code, or start your own household.')}
            </p>
            <PrimaryButton type="button" onClick={() => setMode('join')} disabled={busy}>
              {t('Join with a code')}
            </PrimaryButton>
            <button
              type="button"
              onClick={fresh}
              disabled={busy}
              className="rounded-xl border border-hairline bg-surface px-4 py-3 text-[15px] text-text disabled:opacity-40"
            >
              {busy ? t('Setting up…') : t('Start fresh')}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void join()
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-lg font-normal text-text">{t('Join your household')}</h2>
            <p className="-mt-2 text-sm text-text-2">{t('Ask your partner for an invite code.')}</p>
            <input
              aria-label={t('Invite code')}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCDE-23456"
              className="rounded-xl border border-hairline bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.2em] text-text outline-none focus:border-accent"
            />
            {failureCopy && <p className="text-sm text-text-2">{failureCopy}</p>}
            {error && !failureCopy && <p className="text-sm text-text-2">{error}</p>}
            <PrimaryButton type="submit" disabled={code.trim() === '' || busy}>
              {busy ? t('Joining…') : t('Join')}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setMode('choice')
                setFailure(null)
              }}
              className="text-center text-xs text-text-2"
            >
              {t('Back')}
            </button>
          </form>
        )}

        <div className="mt-10 flex flex-col items-center gap-1 text-center">
          {currentUserEmail && <span className="text-xs text-text-3">{currentUserEmail}</span>}
          <button type="button" onClick={() => void signOut()} className="text-xs text-text-2">
            {t('Sign out')}
          </button>
        </div>
      </div>
    </div>
  )
}
