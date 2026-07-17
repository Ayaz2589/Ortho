'use client'

/**
 * Sticky page header for the mobile new/edit form pages (spec 025). Mirrors the
 * WebModal header contract — Cancel · title · Save — but as a normal in-flow
 * page banner (no portal/scrim/focus-trap): on a full page, back and Save are
 * ordinary controls in DOM order. Labels are passed already-translated so this
 * stays a pure presentational component (no store dependency).
 */
export function FormPageHeader({
  title,
  cancelLabel,
  saveLabel,
  canSave = true,
  onCancel,
  onSave,
}: {
  title: string
  cancelLabel: string
  saveLabel?: string
  canSave?: boolean
  onCancel: () => void
  onSave?: () => void
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center relative border-b border-hairline bg-bg px-1 py-2">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 px-3 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {cancelLabel}
      </button>
      {/* A real heading (not a bare div) so the page has a programmatic name and
          is reachable by the screen-reader "next heading" gesture — the overlays
          this replaced announced their title via the dialog aria-label. */}
      <h1 className="pointer-events-none absolute left-0 right-0 text-center text-[16px] font-normal tracking-[-0.3px] text-text">
        {title}
      </h1>
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="z-[1] ml-auto min-h-11 px-3 text-[15px] font-normal text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:text-text-3 disabled:opacity-100"
        >
          {saveLabel}
        </button>
      )}
    </header>
  )
}
