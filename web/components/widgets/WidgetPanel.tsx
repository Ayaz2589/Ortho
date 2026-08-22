'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { ChevronLeft, X, ArrowRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { useIsExpanded } from '@/lib/useMediaQuery'
import { Drawer } from '@/components/web/Drawer'

/**
 * The shared widget detail-panel frame (spec 057, US1). Every registered
 * `WidgetDefinition.Panel` renders inside this, and inherits — without
 * rebuilding any of it — the widget's title as a header, a close/back control,
 * a bounded scrolling content region, an optional scope caption, an optional
 * second level with a back affordance, and an optional route-out footer.
 *
 * Rather than lifting this state to `WidgetBoard` or `dashboard/page.tsx`,
 * `WidgetPanel` owns the `Drawer` it renders inside directly (mirroring
 * `CsvImportFlow`'s `CsvDrawer`) — the caption, route-out and second-level
 * state a panel supplies are all inherently panel-specific, so keeping them
 * here means a follow-up panel only ever touches its own file, never this one
 * or `WidgetBoard.tsx` (contracts/panel-contract.md X-3, SC-006).
 *
 * D4: `Drawer`'s full-screen mode does not apply safe-area insets and the app
 * shell's padding cannot reach a portaled fixed-inset element, so THIS frame
 * carries `var(--safe-top)` / `var(--safe-bottom)` padding in that presentation
 * — `Drawer` itself is never modified, so `AnnouncementHost` and
 * `CsvImportFlow` are unaffected.
 */

export interface PanelCaption {
  /** "Alice" | "Household" — omit when the panel ignores the people axis. */
  subject?: string
  /** "June 2026" | "Last 90 days" — omit when the panel ignores the time axis. */
  period?: string
}

export interface PanelRouteOut {
  label: string
  href: string
}

interface PanelFrameApi {
  setCaption: (caption: PanelCaption | undefined) => void
  setRouteOut: (routeOut: PanelRouteOut | undefined) => void
  pushDetail: (title: string, content: ReactNode) => void
  popDetail: () => void
}

const PanelFrameContext = createContext<PanelFrameApi | null>(null)

function usePanelFrameApi(hookName: string): PanelFrameApi {
  const api = useContext(PanelFrameContext)
  if (!api) {
    throw new Error(`${hookName} must be called from within a widget's Panel, inside WidgetPanel`)
  }
  return api
}

/**
 * Declare which scope axes this panel honours (contract C-1, FR-013/FR-014).
 * Omit whichever field an axis the panel ignores — the caption must never
 * state an axis a panel does not actually honour.
 */
export function usePanelCaption(caption: PanelCaption | undefined): void {
  const { setCaption } = usePanelFrameApi('usePanelCaption')
  useEffect(() => {
    setCaption(caption)
    return () => setCaption(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption?.subject, caption?.period])
}

/** Supply a route-out destination (contract C-4). Omit when the subject has no
 *  fuller destination elsewhere in the app. */
export function usePanelRouteOut(routeOut: PanelRouteOut | undefined): void {
  const { setRouteOut } = usePanelFrameApi('usePanelRouteOut')
  useEffect(() => {
    setRouteOut(routeOut)
    return () => setRouteOut(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOut?.label, routeOut?.href])
}

/**
 * Push/pop an optional second level within the panel (FR-005, D6). Pushing
 * swaps the frame's close control for "back", steps back on Escape before
 * closing, and shows `content` in place of the panel's own top-level render
 * until `pop()` is called.
 */
export function usePanelDetail(): { push: (title: string, content: ReactNode) => void; pop: () => void } {
  const { pushDetail, popDetail } = usePanelFrameApi('usePanelDetail')
  return { push: pushDetail, pop: popDetail }
}

function formatCaption(caption: PanelCaption | undefined): string | null {
  if (!caption) return null
  const parts = [caption.subject, caption.period].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : null
}

const headerRowStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  padding: '18px 20px 14px',
  borderBottom: '0.5px solid var(--hairline)',
  flexShrink: 0,
}

const headerTitleStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 15,
  fontWeight: 400,
  color: 'var(--text)',
  letterSpacing: '-0.3px',
  pointerEvents: 'none',
  margin: 0,
}

function PanelHeader({
  title,
  mode,
  onAction,
}: {
  title: string
  mode: 'close' | 'back'
  onAction: () => void
}) {
  const { t } = useApp()
  return (
    <div style={headerRowStyle}>
      <button
        type="button"
        className="ow-btn ow-chip-btn"
        aria-label={t(mode === 'back' ? 'Back' : 'Close')}
        onClick={onAction}
        style={{ width: 28, height: 28, zIndex: 1 }}
      >
        {mode === 'back' ? (
          <ChevronLeft size={16} style={{ color: 'var(--text-2)' }} />
        ) : (
          <X size={14} style={{ color: 'var(--text-2)' }} />
        )}
      </button>
      <h2 style={headerTitleStyle}>{title}</h2>
    </div>
  )
}

export function WidgetPanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const isExpanded = useIsExpanded()
  const [caption, setCaption] = useState<PanelCaption | undefined>(undefined)
  const [routeOut, setRouteOut] = useState<PanelRouteOut | undefined>(undefined)
  const [detail, setDetail] = useState<{ title: string; content: ReactNode } | null>(null)

  // A fresh open must never inherit the previous session's pushed detail.
  useEffect(() => {
    if (!open) setDetail(null)
  }, [open])

  const api = useMemo<PanelFrameApi>(
    () => ({
      setCaption,
      setRouteOut,
      pushDetail: (detailTitle, content) => setDetail({ title: detailTitle, content }),
      popDetail: () => setDetail(null),
    }),
    []
  )

  if (!open) return null

  const back = () => setDetail(null)
  const headerTitle = detail ? detail.title : title
  const captionText = detail ? null : formatCaption(caption)

  return (
    <Drawer open={open} onClose={onClose} onEscape={detail ? back : onClose} label={headerTitle} fullBleedOnMobile>
      <PanelFrameContext.Provider value={api}>
        <div
          data-testid="panel-frame"
          className="flex h-full flex-col"
          style={isExpanded ? undefined : { paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
        >
          <PanelHeader title={headerTitle} mode={detail ? 'back' : 'close'} onAction={detail ? back : onClose} />
          {captionText ? (
            <div
              data-testid="panel-caption"
              style={{ padding: '10px 20px 2px', fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}
            >
              {captionText}
            </div>
          ) : null}
          <div
            data-testid="panel-scroll-region"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          >
            {detail ? detail.content : children}
          </div>
          {!detail && routeOut ? (
            <div style={{ padding: '14px 20px', borderTop: '0.5px solid var(--hairline)', flexShrink: 0 }}>
              <Link
                href={routeOut.href}
                className="flex items-center gap-1.5 text-[13px] text-accent"
                style={{ color: 'var(--accent)' }}
              >
                {routeOut.label}
                <ArrowRight size={13} />
              </Link>
            </div>
          ) : null}
        </div>
      </PanelFrameContext.Provider>
    </Drawer>
  )
}
