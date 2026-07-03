import { createBrowserClient } from '@supabase/ssr'
import { isTestBuild } from '@/lib/test-build'
import { effectiveUseTestData, readFlags } from '@/lib/flags'
import { createMemoryClient } from '@/lib/testdata/memory-client'

export function createClient() {
  // Test builds only: when "Use test data" (or "Bypass auth", which implies it)
  // is on, every read/write funnels through an in-memory seeded client, so
  // nothing touches the live backend (spec 015, contract C-TD-1). In production
  // `isTestBuild()` is a build-time `false`, so this branch dead-code-eliminates.
  if (isTestBuild() && typeof window !== 'undefined' && effectiveUseTestData(readFlags())) {
    return createMemoryClient() as unknown as ReturnType<typeof createBrowserClient>
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
