import type { NextConfig } from 'next'

// spec 021: static export so the bundle can be wrapped natively by Capacitor
// (and served with no Next.js server at runtime). `images.unoptimized` is
// required the instant `output: 'export'` is set — the default Image
// Optimization loader needs a server and is unsupported for static export.
// `next/image` is unused today (the prior `remotePatterns` entry was inert),
// so this is a safe default rather than a functional change.
const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
