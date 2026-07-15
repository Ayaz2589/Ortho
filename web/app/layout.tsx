import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { THEME_VARS } from '@/components/settings/appearance'

export const metadata: Metadata = {
  title: 'Ortho',
  description: 'Household finance, in order.',
}

// spec 021: `viewport-fit=cover` lets the app draw under the notch/Dynamic
// Island/home indicator so CSS env(safe-area-inset-*) padding (see
// globals.css) can inset the app shell itself, rather than the OS forcing a
// fixed margin. Paired with capacitor.config.ts's `ios.contentInset: 'never'`
// — the WebView must not ALSO inset itself, or padding doubles up.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Self-hosted Lato — the exact .ttf files the iOS app bundles (no Google Fonts
// CDN). Exposed as the `--font-lato` CSS variable that globals.css consumes.
const lato = localFont({
  src: [
    { path: './fonts/Lato-Light.ttf', weight: '300', style: 'normal' },
    { path: './fonts/Lato-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Lato-Bold.ttf', weight: '700', style: 'normal' },
    { path: './fonts/Lato-Black.ttf', weight: '900', style: 'normal' },
  ],
  variable: '--font-lato',
  display: 'swap',
})

/*
 * Apply the saved appearance before first paint. Runs synchronously during
 * HTML parse (ahead of body content), so the forced light/dark theme is in
 * place on the very first frame of every page — no flash, no dependence on a
 * React effect that only fired on the Settings page. It sets the theme tokens
 * as INLINE CSS variables (the same THEME_VARS the Settings toggle uses), so it
 * works regardless of whether the stylesheet has the forced-theme rules. Reads
 * the same `appearance` localStorage key that appearance.ts writes.
 */
const APPEARANCE_BOOT = `(function(){try{var T=${JSON.stringify(
  THEME_VARS,
)};var m=localStorage.getItem('appearance');var r=document.documentElement;if(m==='light'||m==='dark'){r.setAttribute('data-appearance',m);r.style.colorScheme=m;var v=T[m];for(var k in v){r.style.setProperty(k,v[k]);}}else{r.style.colorScheme='light dark';}if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){r.classList.add('native');}}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${lato.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
        {children}
      </body>
    </html>
  )
}
