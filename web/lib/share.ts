/**
 * spec 021 — FR-013: share exportable data via the standard iOS share sheet.
 * @capacitor/share already falls back to the browser's Web Share API on
 * desktop/mobile web internally, so this stays one uniform call with no
 * platform branching. Resolves `false` (never throws) on cancellation or an
 * unsupported platform — a share sheet dismissal is not an app error.
 */
import { Share, type ShareOptions } from '@capacitor/share'

export async function shareData(options: ShareOptions): Promise<boolean> {
  try {
    await Share.share(options)
    return true
  } catch {
    return false
  }
}
