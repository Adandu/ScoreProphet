import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function requireAuth() {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (!session.isAdmin) redirect('/')
  return session
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session.userId) return null
  return {
    userId: session.userId,
    username: session.username!,
    isAdmin: session.isAdmin ?? false,
    timezone: session.timezone ?? 'Europe/Bucharest',
  }
}
