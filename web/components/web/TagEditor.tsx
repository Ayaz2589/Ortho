'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'

/** Inline tag editor (spec 027): existing tag chips + a free-text add that reuses
 *  a household tag on a case-insensitive match or creates a new one (`addTag`).
 *  Shared by the desktop drawer and the mobile new/edit form via `TxFormFields`. */
export function TagEditor({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { tags = [], addTag, t } = useApp()
  const [text, setText] = useState('')
  const nameOf = (id: string) => tags.find((tg) => tg.id === id)?.name ?? id
  const suggestions = tags.filter((tg) => !value.includes(tg.id))

  const commit = () => {
    const name = text.trim()
    if (!name) {
      setText('')
      return
    }
    const tag = addTag(name)
    if (!value.includes(tag.id)) onChange([...value, tag.id])
    setText('')
  }
  const remove = (id: string) => onChange(value.filter((x) => x !== id))

  return (
    <div className="ow-card" style={{ margin: '0 20px 14px', padding: '12px 16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[13px] text-text"
            style={{ minHeight: 32, background: 'var(--surface)', boxShadow: '0 0 0 0.5px var(--hairline)' }}
          >
            {nameOf(id)}
            <button
              type="button"
              aria-label={t('Remove {0}', nameOf(id))}
              onClick={() => remove(id)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-text-3 transition-colors hover:text-text"
            >
              <svg width="9" height="9" viewBox="0 0 12 12">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          aria-label={t('Add a tag')}
          list="ortho-tag-suggestions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          placeholder={t('Add a tag')}
          className="ow-row-input"
          style={{ flex: '1 0 120px', minWidth: 120, textAlign: 'left' }}
        />
        <datalist id="ortho-tag-suggestions">
          {suggestions.map((tg) => (
            <option key={tg.id} value={tg.name} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
