'use client'

import { useActionState, useState, useTransition } from 'react'
import { updateProfile, changePassword, deleteAccount, sendTestReminderEmail } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TIMEZONES } from '@/components/timezone-selector'

interface ProfileUser {
  username: string
  email: string
  timezone: string
  theme: 'DARK' | 'LIGHT'
  isAdmin: boolean
  predictionReminderEnabled: boolean
  predictionReminderHoursBefore: number
}

export function ProfileClient({ user }: { user: ProfileUser }) {
  const [profileState, profileAction, profilePending] = useActionState(updateProfile, null)
  const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, null)
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccount, null)
  const [email, setEmail] = useState(user.email)
  const [predictionReminderEnabled, setPredictionReminderEnabled] = useState(user.predictionReminderEnabled)
  const [reminderHours, setReminderHours] = useState(user.predictionReminderHoursBefore)
  const [notificationWarning, setNotificationWarning] = useState('')
  const [testPending, startTestTransition] = useTransition()
  const [testResult, setTestResult] = useState<{ error?: string; success?: boolean } | null>(null)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold text-[#C9A84C]">Profile Settings</h2>
        <form action={profileAction} className="mt-4 grid gap-4">
          <input type="hidden" name="predictionReminderHoursBefore" value={reminderHours} />
          <label className="grid gap-1 text-sm text-white/70">
            Username
            <Input name="username" defaultValue={user.username} minLength={2} maxLength={30} className="bg-white/10 text-white border-white/20" />
          </label>

          <label className="grid gap-1 text-sm text-white/70">
            Email
            <Input
              name="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (event.target.value.trim()) setNotificationWarning('')
              }}
              autoComplete="email"
              placeholder="you@example.com"
              className="bg-white/10 text-white border-white/20"
            />
          </label>

          <label className="grid gap-1 text-sm text-white/70">
            Timezone
            <select name="timezone" defaultValue={user.timezone} className="h-9 rounded-lg border border-white/20 bg-[#0A1628] px-2.5 text-sm text-white">
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-sm text-white/70">Theme</legend>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                <input type="radio" name="theme" value="DARK" defaultChecked={user.theme !== 'LIGHT'} />
                Dark
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                <input type="radio" name="theme" value="LIGHT" defaultChecked={user.theme === 'LIGHT'} />
                Light
              </label>
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm text-white/70">Notifications</legend>
            <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
              <input
                type="checkbox"
                name="predictionReminderEnabled"
                value="true"
                checked={predictionReminderEnabled}
                onChange={(event) => {
                  if (event.target.checked && !email.trim()) {
                    setPredictionReminderEnabled(false)
                    setNotificationWarning('Add an email address before enabling prediction reminders.')
                    return
                  }
                  setPredictionReminderEnabled(event.target.checked)
                  setNotificationWarning('')
                }}
                className="mt-0.5"
              />
              <div className="flex items-center gap-2 text-sm text-white/70">
                <span>Email me</span>
                <select
                  value={reminderHours}
                  onChange={(e) => setReminderHours(Number(e.target.value))}
                  className="rounded border border-white/20 bg-white/10 px-2 py-0.5 text-white"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                </select>
                <span>before kickoff when predictions are not set.</span>
              </div>
            </label>
            {notificationWarning && <p className="text-sm text-orange-300">{notificationWarning}</p>}
            {predictionReminderEnabled && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testPending}
                  onClick={() => {
                    setTestResult(null)
                    startTestTransition(async () => {
                      const result = await sendTestReminderEmail()
                      setTestResult(result)
                    })
                  }}
                  className="border-white/20 text-white/70 hover:bg-white/10 bg-transparent text-sm"
                >
                  {testPending ? 'Sending...' : 'Send test email'}
                </Button>
                {testResult?.success && <span className="text-sm text-green-400">Test email sent!</span>}
                {testResult?.error && <span className="text-sm text-red-400">{testResult.error}</span>}
              </div>
            )}
          </fieldset>

          <div>
            <Button type="submit" disabled={profilePending} className="bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 font-semibold">
              {profilePending ? 'Saving...' : 'Save profile'}
            </Button>
            {profileState?.error && <p className="mt-2 text-sm text-red-400">{profileState.error}</p>}
            {profileState?.success && <p className="mt-2 text-sm text-green-400">Profile updated.</p>}
          </div>
        </form>
      </section>

      <div className="grid gap-5">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-[#C9A84C]">Change Password</h2>
          <form action={passwordAction} className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <label htmlFor="currentPassword" className="text-sm text-white/60">Current password</label>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" placeholder="Current password" className="bg-white/10 text-white border-white/20" />
            </div>
            <div className="grid gap-1">
              <label htmlFor="newPassword" className="text-sm text-white/60">New password</label>
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" placeholder="New password" className="bg-white/10 text-white border-white/20" />
            </div>
            <div className="grid gap-1">
              <label htmlFor="confirmPassword" className="text-sm text-white/60">Confirm new password</label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Confirm new password" className="bg-white/10 text-white border-white/20" />
            </div>
            <div>
              <Button type="submit" disabled={passwordPending} variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
                {passwordPending ? 'Updating...' : 'Update password'}
              </Button>
              {passwordState?.error && <p className="mt-2 text-sm text-red-400">{passwordState.error}</p>}
              {passwordState?.success && <p className="mt-2 text-sm text-green-400">Password updated.</p>}
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <h2 className="text-lg font-semibold text-red-300">Delete Account</h2>
          <p className="mt-2 text-sm text-white/50">This permanently removes your account and predictions. Type DELETE to confirm.</p>
          <form action={deleteAction} className="mt-4 grid gap-3">
            <Input name="password" type="password" autoComplete="current-password" placeholder="Password" className="bg-white/10 text-white border-white/20" disabled={user.isAdmin} />
            <Input name="confirmation" placeholder="DELETE" className="bg-white/10 text-white border-white/20" disabled={user.isAdmin} />
            <div>
              <Button type="submit" disabled={deletePending || user.isAdmin} variant="outline" className="border-red-500/40 text-red-300 hover:bg-red-500/10 bg-transparent">
                {deletePending ? 'Deleting...' : 'Delete account'}
              </Button>
              {user.isAdmin && <p className="mt-2 text-sm text-white/40">Admin accounts cannot be deleted from this page.</p>}
              {deleteState?.error && <p className="mt-2 text-sm text-red-400">{deleteState.error}</p>}
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
