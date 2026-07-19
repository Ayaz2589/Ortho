'use client'

/**
 * Settings › Linked banks — the SimpleFIN connect card (spec 028, US1). SimpleFIN
 * is the primary/recommended way to connect a bank. There is no embedded widget or
 * OAuth hand-back: the member gets a one-time SETUP TOKEN from SimpleFIN Bridge and
 * pastes it here; the server claims it, stores the Access URL in Vault, and records
 * the institution. Identical on web and the iOS shell (no native plumbing). Calm,
 * disclosure-first, never red (FR-001/FR-018).
 */
import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { useApp } from '@/lib/store'
import { SectionCard } from '@/components/settings/rows'
import { claimSimpleFinToken } from '@/lib/aggregation'

export function SimpleFinConnect() {
  const { refreshLinkedBanks, t } = useApp()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const noticeFor = (code: string): string => {
    switch (code) {
      case 'invalid_request':
        return t('That setup token could not be read. Copy it again from SimpleFIN.')
      case 'claim_failed':
        return t('That setup token could not be used. Get a fresh one and try again.')
      case 'provider_unreachable':
        return t('Couldn’t reach the bank-connection service. Try again in a bit.')
      case 'not_household_member':
        return t('You need to be in a household to link a bank.')
      default:
        return t('The connection could not be completed. Try again.')
    }
  }

  async function connect() {
    const value = token.trim()
    if (!value) return
    setBusy(true)
    setNotice(null)
    const res = await claimSimpleFinToken(value)
    setBusy(false)
    if (res.ok) {
      setToken('')
      setNotice(t('Bank connected.'))
      void refreshLinkedBanks()
    } else {
      setNotice(noticeFor(res.code))
    }
  }

  return (
    <SectionCard>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2 text-[15px] text-text">
          <span className="text-text-3">
            <Landmark size={16} />
          </span>
          <span>{t('Connect a bank with SimpleFIN')}</span>
        </div>
        {/* Disclosure before connecting (FR-001/FR-018): read-only, no credentials. */}
        <p className="text-[13px] leading-relaxed text-text-3">
          {t(
            'Sign in to your bank on SimpleFIN Bridge, a bank-connection service, then paste the one-time setup token it gives you. Ortho never handles your bank sign-in, access is read-only, and you can disconnect at any time.'
          )}
        </p>
        <label className="flex flex-col gap-1">
          <span className="sr-only">{t('SimpleFIN setup token')}</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('Paste your setup token')}
            aria-label={t('SimpleFIN setup token')}
            className="ow-row-input min-h-11"
            style={{ textAlign: 'left' }}
          />
        </label>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy || token.trim().length === 0}
            className="min-h-11 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {t('Connect with SimpleFIN')}
          </button>
        </div>
        {/* aria-live only (no role="status") so it announces without colliding with
            the page-level status region in LinkedBanks. */}
        <p aria-live="polite" className="min-h-4 text-[13px] leading-relaxed text-text-3">
          {notice}
        </p>
      </div>
    </SectionCard>
  )
}
