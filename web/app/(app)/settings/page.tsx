'use client'

import { useEffect, useState } from 'react'
import {
  Monitor,
  Sun,
  Moon,
  Globe,
  Languages,
  LogOut,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader, SectionLabel } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, LinkRow, CardRow, AddRow, ActionRow } from '@/components/settings/rows'
import { ChoiceRow } from '@/components/settings/ChoiceRows'
import { AddCardModal } from '@/components/settings/AddCardModal'
import { FlagsSection } from '@/components/settings/flags-section'
import { SubscriptionSection } from '@/components/settings/SubscriptionSection'
import {
  type Appearance,
  applyAppearance,
  readAppearance,
  writeAppearance,
} from '@/components/settings/appearance'
import { CURRENCIES, CURRENCY_NAMES, currencyCode } from '@/lib/finance/currency'
import { LANGUAGES } from '@/lib/language'
import type { Translate } from '@/lib/i18n'

/** FX freshness caption for the Currency section — mirrors iOS's `ratesCaption`. */
function ratesCaption({
  isLoading,
  lastFetched,
  error,
  hasRates,
  locale,
  t,
}: {
  isLoading: boolean
  lastFetched: number | null
  error: string | null
  hasRates: boolean
  locale: string
  t: Translate
}): string {
  if (isLoading && !hasRates) return t('Updating rates…')
  if (lastFetched != null) {
    return t('Rates updated {0}', relativeTimeLabel(lastFetched, locale))
  }
  if (error != null) return t('Rates unavailable; using approximate values.')
  return t('Loading rates…')
}

/** Locale-aware relative time ("5 minutes ago"), like iOS's RelativeDateTimeFormatter. */
function relativeTimeLabel(epochMs: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const seconds = Math.round((epochMs - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  return rtf.format(Math.round(seconds / 86400), 'day')
}

export default function SettingsPage() {
  const {
    cards,
    budgets,
    goals,
    linkedInstitutions,
    currentHousehold,
    currentUserEmail,
    currency,
    setCurrency,
    language,
    chooseLanguage,
    deleteCard,
    signOut,
    rates,
    ratesLastFetched,
    ratesIsLoading,
    ratesError,
    locale,
    t,
  } = useApp()
  const [addingCard, setAddingCard] = useState(false)
  const [appearance, setAppearance] = useState<Appearance>('system')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const a = readAppearance()
    setAppearance(a)
    applyAppearance(a)
  }, [])

  const chooseAppearance = (mode: Appearance) => {
    setAppearance(mode)
    writeAppearance(mode)
  }

  return (
    <ReadingColumn>
      <PageHeader title={t('Settings')} />

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Household')}</SectionLabel>
          <SectionCard>
            <LinkRow href="/settings/household" label={t('Household')} peek={currentHousehold?.name} />
            {/* Linked banks (spec 024) — household members only; a user with no
                household never sees the entry (spec edge case). */}
            {currentHousehold && (
              <LinkRow
                href="/settings/linked-banks"
                label={t('Linked banks')}
                peek={(() => {
                  const n = linkedInstitutions.filter((i) => i.status === 'active').length
                  return n ? t('{0} connected', n) : t('None connected')
                })()}
              />
            )}
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Planning')}</SectionLabel>
          <SectionCard>
            <LinkRow
              href="/budgets"
              label={t('Budgets')}
              peek={budgets.length ? t('{0} set', budgets.length) : t('None set')}
            />
            <LinkRow
              href="/goals"
              label={t('Goals')}
              peek={goals.length ? t('{0} set', goals.length) : t('None set')}
            />
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Cards')}</SectionLabel>
          <SectionCard>
            {cards.map((c) => (
              <CardRow key={c.id} card={c} onDelete={() => deleteCard(c.id)} />
            ))}
            {/* Disabled until a real household is resolved — adding a card
                without one silently no-ops server-side (mirrors iOS). */}
            <AddRow label={t('Add card')} onClick={() => setAddingCard(true)} disabled={!currentHousehold} />
          </SectionCard>
          <p className="px-1 text-[13px] leading-relaxed text-text-3">
            {t('Cards appear in the Paid with menu when you log a new expense. Existing transactions keep their original card name.')}
          </p>
        </section>

        {/* Spec 018 — after Cards on both surfaces (US7). */}
        <SubscriptionSection />

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Currency')}</SectionLabel>
          <SectionCard>
            {CURRENCIES.map((c) => (
              <ChoiceRow
                key={c}
                icon={<Globe size={16} />}
                label={`${t(CURRENCY_NAMES[c])} (${currencyCode(c)})`}
                active={c === currency}
                onClick={() => setCurrency(c)}
              />
            ))}
          </SectionCard>
          <p className="px-1 text-[13px] leading-relaxed text-text-3">
            {ratesCaption({
              isLoading: ratesIsLoading,
              lastFetched: ratesLastFetched,
              error: ratesError,
              hasRates: Object.keys(rates).length > 0,
              locale,
              t,
            })}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Language')}</SectionLabel>
          <SectionCard>
            {LANGUAGES.map((lang) => (
              <ChoiceRow
                key={lang}
                icon={<Languages size={16} />}
                label={lang}
                active={lang === language}
                onClick={() => chooseLanguage(lang)}
              />
            ))}
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Appearance')}</SectionLabel>
          <SectionCard>
            <ChoiceRow
              icon={<Monitor size={16} />}
              label={t('System')}
              active={appearance === 'system'}
              onClick={() => chooseAppearance('system')}
            />
            <ChoiceRow
              icon={<Sun size={16} />}
              label={t('Light')}
              active={appearance === 'light'}
              onClick={() => chooseAppearance('light')}
            />
            <ChoiceRow
              icon={<Moon size={16} />}
              label={t('Dark')}
              active={appearance === 'dark'}
              onClick={() => chooseAppearance('dark')}
            />
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>{t('Account')}</SectionLabel>
          <SectionCard>
            {signingOut ? (
              <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
                <span className="text-[15px] text-text-2">{t('Sign out of Ortho?')}</span>
                <span className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSigningOut(false)}
                    className="text-[15px] font-normal text-text-2"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="text-[15px] font-normal text-destructive"
                  >
                    {t('Sign out')}
                  </button>
                </span>
              </div>
            ) : (
              <ActionRow
                icon={<LogOut size={16} />}
                label={t('Sign out')}
                sub={currentUserEmail ?? undefined}
                destructive
                onClick={() => setSigningOut(true)}
              />
            )}
          </SectionCard>
        </section>

        {/* Developer / feature flags — self-gated to test builds only. */}
        <FlagsSection />
      </div>

      <AddCardModal open={addingCard} onClose={() => setAddingCard(false)} />
    </ReadingColumn>
  )
}
