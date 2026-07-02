'use client'

import { Suspense } from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { resetPassword } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function ResetPasswordContent() {
  const token = useSearchParams().get('token') ?? ''
  const [state, action, isPending] = useActionState(resetPassword, null)

  return (
    <main className="min-h-screen bg-[#0A1628] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/5 border border-white/10 text-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold text-center text-[#C9A84C]">
            Choose New Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">
                New password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="New password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white/80">
                Confirm new password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="Confirm new password"
              />
            </div>

            {state?.error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                {state.error}
              </p>
            )}
            {state?.success && (
              <p className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-md px-3 py-2">
                Password updated. You can sign in with your new password.
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending || !token || Boolean(state?.success)}
              className="w-full bg-[#C9A84C] text-[#0A1628] font-semibold hover:bg-[#D4B85A] disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Updating...' : 'Update password'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-white/50">
            <Link href="/login" className="text-[#C9A84C] hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  )
}
