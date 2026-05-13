'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { register } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  const [state, action, isPending] = useActionState(register, null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('next') ?? '/'

  return (
    <main className="min-h-screen bg-[#0A1628] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/5 border border-white/10 text-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold text-center text-[#C9A84C]">
            ScoreProphet
          </CardTitle>
          <p className="text-center text-white/60 text-sm mt-1">Create your account</p>
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
                minLength={2}
                maxLength={30}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="Choose a username (2–30 characters)"
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
                autoComplete="new-password"
                required
                minLength={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="Choose a password (min. 6 characters)"
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
              {isPending ? 'Creating account…' : 'Create Account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-white/50">
            Already have an account?{' '}
            <Link href={`/login?next=${encodeURIComponent(redirectTo)}`} className="text-[#C9A84C] hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
