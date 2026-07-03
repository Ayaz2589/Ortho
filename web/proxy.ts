import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isTestBuild } from './lib/test-build'
import { BYPASS_AUTH_COOKIE } from './lib/flags'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/sign-in')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  // Test builds only: the "Bypass auth" flag (spec 015) sets this cookie so a
  // session-less tester reaches the app instead of being bounced to /sign-in.
  // In production `isTestBuild()` is a build-time `false`, so the cookie is
  // ignored and the gate is unchanged (contract C-TD-4/C-FF-4).
  const bypassAuth =
    isTestBuild() && request.cookies.get(BYPASS_AUTH_COOKIE)?.value === '1'

  if (!user && !isAuthRoute && !isApiRoute && !bypassAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // No single-active-platform lock: iOS and web may be signed in at once
  // (feature 010). The 30-day session cap is enforced by the Supabase session
  // timebox; an expired session yields no `user` above and is redirected to
  // /sign-in like any other signed-out request.

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
