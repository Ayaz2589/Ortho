'use client'

/**
 * Spec 017 US1/US5 — the owner's "Invite your partner" card (Settings → Household).
 *
 * Creates a one-time invite (the code is revealed exactly once, straight from the
 * resolved `createInvite()` — it exists nowhere else and is unrecoverable after
 * Done), lists the household's invites with calm text statuses, and revokes
 * pending ones behind an inline confirm. Owners only; members render nothing
 * (RLS would hand them an empty list anyway).
 */
import { useState } from 'react'
import { useApp } from '@/lib/store'
import { SectionCard } from '@/components/settings/rows'
import { SectionLabel } from '@/components/ui'
import { inviteStatus, joinLink, canonicalizeInviteCode } from '@/lib/invites'
import type { PendingInvite } from '@/lib/types'

const DAY_MS = 24 * 60 * 60 * 1000

export function InviteCard() {
  const { currentRole, invites, createInvite, revokeInvite, t } = useApp()
  const [revealedCode, setRevealedCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  if (currentRole !== 'owner') return null

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    setCopied(null)
    const result = await createInvite()
    setCreating(false)
    // Reveal only after the row is durably persisted — a failed insert surfaces
    // via the store's error banner and must never show a dead code.
    if (result.ok) setRevealedCode(result.code)
  }

  const copy = (kind: 'code' | 'link') => {
    if (!revealedCode) return
    const text =
      kind === 'code'
        ? revealedCode
        : joinLink(window.location.origin, canonicalizeInviteCode(revealedCode))
    void navigator.clipboard?.writeText(text)
    setCopied(kind)
  }

  const statusFor = (invite: PendingInvite) => inviteStatus(invite, new Date())

  const expiryDetail = (invite: PendingInvite) => {
    const days = Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / DAY_MS)
    return days <= 0 ? t('Expires today') : days === 1 ? t('Expires today') : t('Expires in {0} days', days)
  }

  return (
    <div data-testid="invite-card" className="flex flex-col gap-2">
      <SectionLabel>{t('Invite your partner')}</SectionLabel>
      <SectionCard>
        {revealedCode ? (
          <div className="flex flex-col items-center gap-3 px-4 py-5" aria-live="polite">
            <div
              data-testid="invite-code-reveal"
              className="font-mono text-[22px] tracking-[0.2em] text-text"
            >
              {revealedCode}
            </div>
            <p className="text-center text-[13px] leading-relaxed text-text-3">
              {t('This code is shown only once — copy or share it now.')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copy('code')}
                className="rounded-full px-4 py-2 text-[14px] text-text-2"
                style={{ background: 'var(--chip-bg)' }}
              >
                {copied === 'code' ? t('Code copied') : t('Copy code')}
              </button>
              <button
                type="button"
                onClick={() => copy('link')}
                className="rounded-full px-4 py-2 text-[14px] text-text-2"
                style={{ background: 'var(--chip-bg)' }}
              >
                {copied === 'link' ? t('Link copied') : t('Copy link')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevealedCode(null)
                  setCopied(null)
                }}
                className="rounded-full px-4 py-2 text-[14px] text-accent"
              >
                {t('Done')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex min-h-[52px] w-full items-center px-4 py-3 text-left text-[17px] text-accent disabled:opacity-40"
          >
            {creating ? t('Creating…') : t('Create invite')}
          </button>
        )}

        {invites.map((invite) => {
          const status = statusFor(invite)
          return (
            <div key={invite.id} className="flex min-h-[52px] items-center gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[15px] text-text">
                  {status === 'pending' ? t('Pending') : status === 'redeemed' ? t('Redeemed') : t('Expired')}
                </div>
                {status === 'pending' && (
                  <div className="text-[13px] text-text-3">{expiryDetail(invite)}</div>
                )}
              </div>
              {status === 'pending' && (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {confirmRevokeId === invite.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(null)}
                        className="rounded-full px-3 py-1.5 text-[13px] text-text-2"
                        style={{ background: 'var(--chip-bg)' }}
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRevokeId(null)
                          revokeInvite(invite.id)
                        }}
                        className="rounded-full px-3 py-1.5 text-[13px] text-white"
                        style={{ background: 'var(--destructive)' }}
                      >
                        {t('Revoke invite')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(invite.id)}
                      className="text-[14px] text-text-2"
                    >
                      {t('Revoke')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </SectionCard>
      <p className="px-1 text-[13px] leading-relaxed text-text-3">
        {t('Your partner signs in with their own email, then enters this code to join your household.')}
      </p>
    </div>
  )
}
