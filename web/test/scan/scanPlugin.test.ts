// Typed JS wrapper around the native Scan plugin (spec 021, contracts/scan-plugin-api.md).
// registerPlugin itself is mocked — this suite only covers the wrapper's own
// logic: the empty-object -> null mapping for refineMerchant/rescue (Capacitor's
// iOS bridge can only resolve a JSON object, never a bare null — see the
// contract's "Implementation note" under refineMerchant), and pass-through
// delegation for every other method.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registerPlugin } = vi.hoisted(() => ({ registerPlugin: vi.fn() }))
vi.mock('@capacitor/core', () => ({ registerPlugin }))

describe('scanPlugin wrapper', () => {
  const native = {
    capture: vi.fn(),
    extractPDF: vi.fn(),
    refineMerchant: vi.fn(),
    rescue: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    addListener: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    registerPlugin.mockReturnValue(native)
  })

  it('registers the plugin under the name "Scan"', async () => {
    await import('@/lib/scan/scanPlugin')
    expect(registerPlugin).toHaveBeenCalledWith('Scan')
  })

  it('capture() delegates directly (never null — resolves or rejects)', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    const captureResult = { imageUri: 'file:///tmp/x.jpg', page: { lines: [], tables: [] } }
    native.capture.mockResolvedValue(captureResult)
    await expect(ScanPlugin.capture()).resolves.toEqual(captureResult)
  })

  it('extractPDF() delegates directly with the fileUri argument', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    native.extractPDF.mockResolvedValue({ pages: [] })
    await ScanPlugin.extractPDF({ fileUri: 'file:///tmp/statement.pdf' })
    expect(native.extractPDF).toHaveBeenCalledWith({ fileUri: 'file:///tmp/statement.pdf' })
  })

  it('refineMerchant() maps an empty object result to null', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    native.refineMerchant.mockResolvedValue({})
    await expect(ScanPlugin.refineMerchant({ merchant: 'BLUE BOTTLE' })).resolves.toBeNull()
  })

  it('refineMerchant() passes through a real result unchanged', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    native.refineMerchant.mockResolvedValue({ merchant: 'Blue Bottle', category: 'coffee' })
    await expect(ScanPlugin.refineMerchant({ merchant: 'BLUE BOTTLE' })).resolves.toEqual({
      merchant: 'Blue Bottle',
      category: 'coffee',
    })
  })

  it('rescue() maps an empty object result to null', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    native.rescue.mockResolvedValue({})
    await expect(ScanPlugin.rescue({ page: { lines: [], tables: [] } })).resolves.toBeNull()
  })

  it('rescue() passes through a real result unchanged', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    const guess = { merchantRaw: 'CORNER PLACE', date: '2026-07-01', amount: '$12.00', direction: 'debit' as const }
    native.rescue.mockResolvedValue(guess)
    await expect(ScanPlugin.rescue({ page: { lines: [], tables: [] } })).resolves.toEqual(guess)
  })

  it('checkPermissions()/requestPermissions() delegate directly', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    native.checkPermissions.mockResolvedValue({ camera: 'granted' })
    native.requestPermissions.mockResolvedValue({ camera: 'granted' })
    await expect(ScanPlugin.checkPermissions()).resolves.toEqual({ camera: 'granted' })
    await expect(ScanPlugin.requestPermissions()).resolves.toEqual({ camera: 'granted' })
  })

  it('onPageCaptured() subscribes to the native pageCaptured event', async () => {
    const { ScanPlugin } = await import('@/lib/scan/scanPlugin')
    const handler = vi.fn()
    ScanPlugin.onPageCaptured(handler)
    expect(native.addListener).toHaveBeenCalledWith('pageCaptured', handler)
  })
})
