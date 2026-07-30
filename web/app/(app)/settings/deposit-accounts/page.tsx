'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useApp } from '@/lib/store'
import { PageHeader } from '@/components/ui'
import { ReadingColumn } from '@/components/layout'
import { SectionCard, CardRow, AddRow } from '@/components/settings/rows'
import { AddDepositAccountModal } from '@/components/settings/AddDepositAccountModal'

export default function DepositAccountsPage() {
  const { depositAccounts, currentHousehold, deleteDepositAccount, t } = useApp()
  const [adding, setAdding] = useState(false)

  return (
    <ReadingColumn>
      <div className="pt-2 lg:hidden">
        <Link href="/settings" className="inline-flex items-center gap-1 text-[15px] text-accent">
          <ChevronLeft size={18} />
          {t('Settings')}
        </Link>
      </div>
      <PageHeader title={t('Deposit Accounts')} />
      <SectionCard>
        {depositAccounts.map((a) => (
          <CardRow key={a.id} card={a} onDelete={() => deleteDepositAccount(a.id)} />
        ))}
        <AddRow label={t('Add account')} onClick={() => setAdding(true)} disabled={!currentHousehold} />
      </SectionCard>
      <p className="mt-2 px-1 text-[13px] leading-relaxed text-text-3">
        {t('Accounts appear in the Deposit to menu when you log income. Existing transactions keep their original account name.')}
      </p>
      <AddDepositAccountModal open={adding} onClose={() => setAdding(false)} />
    </ReadingColumn>
  )
}
