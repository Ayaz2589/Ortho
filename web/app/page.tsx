'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// spec 021: was a Server Component `redirect()`. Still technically supported
// under `output: 'export'` (Next emits a build-time meta-refresh), but a
// client redirect keeps this consistent with the rest of the now-fully-client
// app and avoids depending on that build-time behavior.
export default function Home() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard')
  }, [router])
  return null
}
