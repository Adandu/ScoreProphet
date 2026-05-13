import { headers } from 'next/headers'

export async function getAppUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  if (!host) throw new Error('APP_URL is not configured')
  return `${proto}://${host}`
}

export function getSafeRedirectPath(value: FormDataEntryValue | string | null): string {
  const path = String(value ?? '').trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}
