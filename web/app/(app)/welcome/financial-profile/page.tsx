'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { ReadingColumn } from '@/components/layout'
import { PrimaryButton } from '@/components/ui'
import {
  ProfileSection,
  SECTION_TITLES,
  SECTION_COUNT,
} from '@/components/financial-health/FinancialProfileForm'
import { useFinancialProfileForm } from '@/components/financial-health/useFinancialProfileForm'

/**
 * First-run Financial Health questionnaire (spec 041, US1; spec 042). A calm,
 * minimal stepper: one section per screen, a progress indicator, and a "Skip for
 * now" escape hatch on every screen. Completing writes the profile + a baseline
 * snapshot and lands on the dashboard. Skipping is DISMISS-ONLY — it writes no
 * profile (so the widget honestly shows its "set up your profile" prompt) and
 * just returns to the dashboard.
 */
export default function FinancialProfileWelcomePage() {
  const { t } = useApp()
  const router = useRouter()
  const form = useFinancialProfileForm()
  const [step, setStep] = useState(0)

  const isLast = step === SECTION_COUNT - 1
  const canAdvance = step !== 0 || form.incomeValid

  const finish = async () => {
    await form.submit()
    router.replace('/dashboard')
  }

  // Dismiss-only: no profile is written, so an honest empty state shows on the
  // dashboard rather than a score derived from a zero-income profile.
  const skip = () => {
    router.replace('/dashboard')
  }

  return (
    <ReadingColumn className="pt-4">
      {/* Progress */}
      <div className="mb-6 flex items-center gap-1.5" aria-label={t('Step {0} of {1}', step + 1, SECTION_COUNT)}>
        {Array.from({ length: SECTION_COUNT }, (_, i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i <= step ? 'var(--accent)' : 'var(--hairline)' }}
          />
        ))}
      </div>

      <h1 className="mb-1 text-[26px] font-light tracking-[-0.4px] text-text">{t('Financial health')}</h1>
      <h2 className="mb-5 text-[17px] font-normal text-text-2">{t(SECTION_TITLES[step])}</h2>

      <ProfileSection index={step} draft={form.draft} patch={form.patch} />

      <div className="mt-8 flex flex-col gap-3">
        {isLast ? (
          <PrimaryButton onClick={() => void finish()} disabled={form.saving}>
            {t('See my score')}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
            {t('Continue')}
          </PrimaryButton>
        )}

        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="text-[14px] text-text-2">
              {t('Back')}
            </button>
          ) : (
            <span />
          )}
          {/* Skip is available on every step (incl. Income) so a user with nothing
              to report is never trapped. Dismiss-only — writes no profile. */}
          <button
            type="button"
            onClick={skip}
            className="text-[14px] text-text-3"
          >
            {t('Skip for now')}
          </button>
        </div>
      </div>
    </ReadingColumn>
  )
}
