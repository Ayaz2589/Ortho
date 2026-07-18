// Browser file-dialog helper for the web scan fallback (fix/web-scan-fallback).
//
// On the web/Vercel build the native FilePicker/Scan plugins are unimplemented,
// so we open a transient <input type="file"> instead. Kept deliberately tiny
// and framework-free (no hidden JSX input to thread refs through) — the caller
// just awaits a File.
//
// The .click() MUST fire inside the originating user gesture (the picker
// button's onClick), so callers invoke this synchronously before any await.

/**
 * Open a native file dialog and resolve the chosen File, or null if the user
 * cancels. `capture`, when set, hints mobile browsers to open the camera
 * directly (accept="image/*" capture="environment").
 */
export function pickFile(accept: string, capture?: 'environment' | 'user'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    if (capture) input.setAttribute('capture', capture)
    input.style.display = 'none'

    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    // Modern browsers fire 'cancel' when the dialog is dismissed with no
    // selection; older ones simply never fire 'change' (the promise then stays
    // pending and the flow stays idle — an acceptable degrade, never a crash).
    input.addEventListener('cancel', () => finish(null))

    document.body.appendChild(input)
    input.click()
  })
}
