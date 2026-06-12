import type { Metadata } from 'next'
import './globals.css'
import { THEME_VARS } from '@/components/settings/appearance'

export const metadata: Metadata = {
  title: 'Ortho',
  description: 'Household finance, in order.',
}

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
)};var m=localStorage.getItem('appearance');var r=document.documentElement;if(m==='light'||m==='dark'){r.setAttribute('data-appearance',m);r.style.colorScheme=m;var v=T[m];for(var k in v){r.style.setProperty(k,v[k]);}}else{r.style.colorScheme='light dark';}}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
        {children}
      </body>
    </html>
  )
}
