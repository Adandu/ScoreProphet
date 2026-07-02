'use client'

import { Suspense } from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { login } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function LoginContent() {
  const [state, action, isPending] = useActionState(login, null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('next') ?? '/'

  return (
    <main className="min-h-screen bg-[#0A1628] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/5 border border-white/10 text-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold text-center text-[#C9A84C]">
            ScoreProphet
          </CardTitle>
          <p className="text-center text-white/60 text-sm mt-1">Sign in to your account</p>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="space-y-2">
              <Label htmlFor="username" className="text-white/80">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="Enter your username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="Enter your password"
              />
            </div>

            {state?.error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                {state.error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#C9A84C] text-[#0A1628] font-semibold hover:bg-[#D4B85A] disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-white/50">
            <Link href="/forgot-password" className="text-[#C9A84C] hover:underline">
              Forgot password?
            </Link>
          </p>

          <p className="mt-2 text-center text-sm text-white/50">
            Don&apos;t have an account?{' '}
            <Link href={`/register?next=${encodeURIComponent(redirectTo)}`} className="text-[#C9A84C] hover:underline">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
