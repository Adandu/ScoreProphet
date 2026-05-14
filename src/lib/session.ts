import { getIronSession, type IronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: number
  username?: string
  isAdmin?: boolean
  timezone?: string
  theme?: 'DARK' | 'LIGHT'
  selectedChampionshipId?: number
}

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required')
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET,
  cookieName: 'scoreprophet-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30,
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
