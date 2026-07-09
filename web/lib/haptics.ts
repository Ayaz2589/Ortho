/**
 * spec 021 — thin native-aware haptic feedback helper (FR-012). No-op on
 * desktop/mobile web; the plugin's web shim would otherwise silently do
 * nothing anyway, but checking explicitly avoids an unnecessary async call
 * on every confirmation/delete on the platforms that don't support it.
 */
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/** A key confirmation succeeded (e.g. a transaction was saved). */
export function hapticConfirm(): void {
  if (!Capacitor.isNativePlatform()) return
  void Haptics.impact({ style: ImpactStyle.Light })
}

/** A destructive action completed (e.g. a transaction or property was deleted). */
export function hapticDestructive(): void {
  if (!Capacitor.isNativePlatform()) return
  void Haptics.notification({ type: NotificationType.Warning })
}
