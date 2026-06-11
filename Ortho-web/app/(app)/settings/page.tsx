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
import {
  type Appearance,
  applyAppearance,
  readAppearance,
  writeAppearance,
} from '@/components/settings/appearance'
import { CURRENCIES, CURRENCY_NAMES, currencyCode } from '@/lib/finance/currency'

const LANGUAGES = ['System', 'English', 'বাংলা', 'Español', '日本語', '简体中文', '한국어']

export default function SettingsPage() {
  const { cards, budgets, currentHousehold, currency, setCurrency, deleteCard, signOut } = useApp()
  const [addingCard, setAddingCard] = useState(false)
  const [appearance, setAppearance] = useState<Appearance>('system')
  const [language, setLanguage] = useState('System')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const a = readAppearance()
    setAppearance(a)
    applyAppearance(a)
    const l = localStorage.getItem('language')
    if (l) setLanguage(l)
  }, [])

  const chooseAppearance = (mode: Appearance) => {
    setAppearance(mode)
    writeAppearance(mode)
  }

  const chooseLanguage = (lang: string) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <ReadingColumn>
      <PageHeader title="Settings" />

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <SectionLabel>Household</SectionLabel>
          <SectionCard>
            <LinkRow href="/settings/household" label="Household" peek={currentHousehold?.name} />
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Budgets</SectionLabel>
          <SectionCard>
            <LinkRow
              href="/budgets"
              label="Budgets"
              peek={budgets.length ? `${budgets.length} set` : 'None set'}
            />
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Cards</SectionLabel>
          <SectionCard>
            {cards.map((c) => (
              <CardRow key={c.id} card={c} onDelete={() => deleteCard(c.id)} />
            ))}
            <AddRow label="Add card" onClick={() => setAddingCard(true)} />
          </SectionCard>
          <p className="px-1 text-[13px] leading-relaxed text-text-3">
            Cards appear in the Paid with menu when you log a new expense. Existing transactions keep
            their original card name.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Currency</SectionLabel>
          <SectionCard>
            {CURRENCIES.map((c) => (
              <ChoiceRow
                key={c}
                icon={<Globe size={16} />}
                label={`${CURRENCY_NAMES[c]} (${currencyCode(c)})`}
                active={c === currency}
                onClick={() => setCurrency(c)}
              />
            ))}
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Language</SectionLabel>
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
          <SectionLabel>Appearance</SectionLabel>
          <SectionCard>
            <ChoiceRow
              icon={<Monitor size={16} />}
              label="System"
              active={appearance === 'system'}
              onClick={() => chooseAppearance('system')}
            />
            <ChoiceRow
              icon={<Sun size={16} />}
              label="Light"
              active={appearance === 'light'}
              onClick={() => chooseAppearance('light')}
            />
            <ChoiceRow
              icon={<Moon size={16} />}
              label="Dark"
              active={appearance === 'dark'}
              onClick={() => chooseAppearance('dark')}
            />
          </SectionCard>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Account</SectionLabel>
          <SectionCard>
            {signingOut ? (
              <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
                <span className="text-[15px] text-text-2">Sign out of Ortho?</span>
                <span className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSigningOut(false)}
                    className="text-[15px] font-semibold text-text-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="text-[15px] font-semibold text-destructive"
                  >
                    Sign out
                  </button>
                </span>
              </div>
            ) : (
              <ActionRow
                icon={<LogOut size={16} />}
                label="Sign out"
                destructive
                onClick={() => setSigningOut(true)}
              />
            )}
          </SectionCard>
        </section>
      </div>

      <AddCardModal open={addingCard} onClose={() => setAddingCard(false)} />
    </ReadingColumn>
  )
}
