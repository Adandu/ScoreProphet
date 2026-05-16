'use server'
import crypto, { timingSafeEqual } from 'crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword, requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { sendPasswordResetEmail, sendPredictionReminderEmail } from '@/lib/email'
import { getAppUrl, getSafeRedirectPath } from '@/lib/app-url'
import { normalizeEmail } from '@/lib/utils'
import { formatMatchTime } from '@/lib/format-date'
import { stageLabel } from '@/lib/prediction-reminder-rules'

export async function register(prevState: unknown, formData: FormData) {
  const username = (formData.get('username') as string)?.trim()
  const password = formData.get('password') as string
  const redirectTo = getSafeRedirectPath(formData.get('redirectTo'))
  if (!username || username.length < 2 || username.length > 30) return { error: 'Username must be 2–30 characters' }
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' }
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) return { error: 'Username already taken' }
  const adminPassword = process.env.ADMIN_PASSWORD
  const isConfiguredAdmin =
    username === process.env.ADMIN_USERNAME &&
    !!adminPassword &&
    (() => {
      const a = Buffer.from(password)
      const b = Buffer.from(adminPassword)
      return a.length === b.length && timingSafeEqual(a, b)
    })()
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({ data: { username, passwordHash, isAdmin: isConfiguredAdmin } })
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isAdmin = user.isAdmin
  session.timezone = user.timezone
  session.theme = user.theme
  await session.save()
  redirect(redirectTo)
}

export async function login(prevState: unknown, formData: FormData) {
  const username = (formData.get('username') as string)?.trim()
  const password = formData.get('password') as string
  const redirectTo = getSafeRedirectPath(formData.get('redirectTo'))
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return { error: 'Invalid username or password' }
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return { error: 'Invalid username or password' }
  const session = await getSession()
  session.userId = user.id
  session.username = user.username
  session.isAdmin = user.isAdmin
  session.timezone = user.timezone
  session.theme = user.theme
  await session.save()
  redirect(redirectTo)
}

export async function logout() {
  const session = await getSession()
  session.destroy()
  redirect('/login')
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function updateTimezone(timezone: string) {
  const session = await requireAuth()
  if (!isValidTimezone(timezone)) return
  await prisma.user.update({ where: { id: session.userId! }, data: { timezone } })
  session.timezone = timezone
  await session.save()
  revalidatePath('/', 'layout')
}

export async function updateProfile(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const username = (formData.get('username') as string)?.trim()
  const emailValue = normalizeEmail((formData.get('email') as string) ?? '')
  const timezone = (formData.get('timezone') as string)?.trim()
  const theme = (formData.get('theme') as string)?.trim()
  const predictionReminderEnabled = formData.get('predictionReminderEnabled') === 'true'

  if (!username || username.length < 2 || username.length > 30) return { error: 'Username must be 2-30 characters' }
  if (emailValue === null) return { error: 'Enter a valid email address' }
  if (predictionReminderEnabled && !emailValue) return { error: 'Add an email address before enabling prediction reminders' }
  if (!timezone || !isValidTimezone(timezone)) return { error: 'Choose a valid timezone' }
  if (theme !== 'DARK' && theme !== 'LIGHT') return { error: 'Choose a valid theme' }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing && existing.id !== session.userId) return { error: 'Username already taken' }
  if (emailValue) {
    const existingEmail = await prisma.user.findUnique({ where: { email: emailValue } })
    if (existingEmail && existingEmail.id !== session.userId) return { error: 'Email already in use' }
  }

  const user = await prisma.user.update({
    where: { id: session.userId! },
    data: { username, email: emailValue, timezone, theme, predictionReminderEnabled },
  })

  session.username = user.username
  session.timezone = user.timezone
  session.theme = user.theme
  await session.save()
  revalidatePath('/', 'layout')
  revalidatePath('/profile')
  return { success: true }
}

export async function changePassword(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!currentPassword) return { error: 'Enter your current password' }
  if (!newPassword || newPassword.length < 8) return { error: 'New password must be at least 8 characters' }
  if (newPassword !== confirmPassword) return { error: 'New passwords do not match' }

  const user = await prisma.user.findUnique({ where: { id: session.userId! } })
  if (!user) return { error: 'User not found' }
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) return { error: 'Current password is incorrect' }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  })

  session.destroy()
  return { success: true }
}

export async function deleteAccount(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const password = formData.get('password') as string
  const confirmation = (formData.get('confirmation') as string)?.trim()

  if (confirmation !== 'DELETE') return { error: 'Type DELETE to confirm account deletion' }
  const user = await prisma.user.findUnique({ where: { id: session.userId! } })
  if (!user) return { error: 'User not found' }
  if (user.isAdmin) return { error: 'Admin accounts cannot be deleted from profile' }
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return { error: 'Password is incorrect' }

  await prisma.user.delete({ where: { id: user.id } })
  const currentSession = await getSession()
  currentSession.destroy()
  redirect('/register')
}

export async function requestPasswordReset(prevState: unknown, formData: FormData) {
  const email = normalizeEmail((formData.get('email') as string) ?? '')
  if (email === null) return { error: 'Enter a valid email address' }

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      })
      const token = crypto.randomBytes(32).toString('base64url')
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })

      const resetUrl = `${await getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`
      try {
        await sendPasswordResetEmail(user.email!, resetUrl)
      } catch {
        return { error: 'Failed to send email. Please try again.' }
      }
    }
  }

  return { success: true }
}

export async function resetPassword(prevState: unknown, formData: FormData) {
  const token = (formData.get('token') as string)?.trim()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!token) return { error: 'Password reset link is missing or invalid' }
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' }
  if (password !== confirmPassword) return { error: 'Passwords do not match' }

  const tokenHash = hashToken(token)
  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash } })
    if (!reset || reset.usedAt || reset.expiresAt <= now) return null

    await Promise.all([
      tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: now },
      }),
      tx.passwordResetToken.deleteMany({
        where: { userId: reset.userId, id: { not: reset.id }, usedAt: null },
      }),
    ])
    return reset.userId
  })

  if (!result) return { error: 'Password reset link has expired' }
  return { success: true }
}

export async function sendTestReminderEmail(): Promise<{ error?: string; success?: boolean }> {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.userId! } })
  if (!user?.email) return { error: 'No email address saved on your account.' }
  if (!user.predictionReminderEnabled) return { error: 'Save your profile with reminders enabled first.' }

  const match = await prisma.match.findFirst({ orderBy: { kickoff: 'asc' } })
  const membership = await prisma.championshipMember.findFirst({
    where: { userId: user.id },
    include: { championship: true },
  })

  const appUrl = (await getAppUrl()).replace(/\/$/, '')
  try {
    await sendPredictionReminderEmail(
      user.email,
      {
        homeTeam: match?.homeTeam ?? 'Home Team',
        awayTeam: match?.awayTeam ?? 'Away Team',
        homeTeamCrest: match?.homeTeamCrest || undefined,
        awayTeamCrest: match?.awayTeamCrest || undefined,
        kickoffLabel: match ? formatMatchTime(match.kickoff, user.timezone) : 'Thu, 12 Jun · 20:00',
        stageLabel: match ? stageLabel(match.stage) : 'Group Stage',
        championshipName: membership?.championship.name ?? 'My Championship',
      },
      `${appUrl}/championships/${membership?.championshipId ?? 1}/predictions`,
    )
  } catch {
    return { error: 'Failed to send email. Check your SMTP settings.' }
  }
  return { success: true }
}
