import type { CapacitorConfig } from '@capacitor/cli'

// spec 021: reuses the existing native app's bundle id (`AyazUddin.Ortho-iOS`,
// confirmed from iOS/Ortho-iOS.xcodeproj/project.pbxproj) so this continues the
// existing App Store Connect / TestFlight listing rather than forking a new
// one (FR-015). Capacitor's `cap init` validator rejects the dash (it defends
// against invalid Android package names); Android is explicitly out of scope
// for this feature (FR-019), and the dash is a fully valid iOS bundle
// identifier, so validation was skipped rather than changing the id.
const config: CapacitorConfig = {
  appId: 'AyazUddin.Ortho-iOS',
  appName: 'Ortho',
  webDir: 'out',
  ios: {
    // Safe-area insets are handled via `viewport-fit=cover` + CSS env()
    // padding on the app shell (see app/layout.tsx / globals.css), not native
    // content insetting — so the WebView must not additionally inset itself.
    contentInset: 'never',
    scheme: 'App',
  },
  server: {
    // Supabase's CORS-origin validator rejects non-http(s) schemes; the
    // default production origin (`capacitor://localhost`) would silently
    // break every Supabase API call. `https://localhost` is allow-listable
    // in Supabase's CORS settings like an ordinary origin.
    iosScheme: 'https',
  },
}

export default config
