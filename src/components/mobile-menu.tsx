'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { logout } from '@/actions/auth'
import { TimezoneSelector } from '@/components/timezone-selector'
import { ChampionshipSelector } from '@/components/championship-selector'

interface User {
  userId: number
  username: string
  isAdmin: boolean
  timezone: string
  theme?: 'DARK' | 'LIGHT'
}

interface Championship {
  id: number
  name: string
}

export function MobileMenu({
  user,
  championships,
  selectedChampionship,
  hasLiveMatch = false,
  canManageChampionships = false,
}: {
  user: User | null
  championships: Championship[]
  selectedChampionship: Championship | null
  hasLiveMatch?: boolean
  canManageChampionships?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (!user) return null

  const close = () => setOpen(false)

  const links = [
    { href: '/', label: 'Home' },
    ...(selectedChampionship
      ? [{ href: `/championships/${selectedChampionship.id}/predictions`, label: selectedChampionship.name, highlight: true }]
      : []),
    { href: '/tournament', label: 'Tournament' },
    { href: '/instructions', label: 'How to Play' },
    { href: '/profile', label: 'Profile' },
    ...(canManageChampionships ? [{ href: '/manage', label: 'Manage', gold: true }] : []),
    ...(user.isAdmin ? [{ href: '/admin', label: 'Admin', gold: true }] : []),
  ]

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full border-b border-white/10 bg-[#0A1628] px-4 py-4 shadow-2xl">
          <div className="flex flex-col gap-4">
            <div className="grid gap-1 text-sm text-white/75">
              {hasLiveMatch && (
                <Link
                  href="/live"
                  onClick={close}
                  className="flex items-center gap-1.5 rounded-md px-2 py-2 font-semibold text-red-400 hover:bg-white/10"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </Link>
              )}
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className={`rounded-md px-2 py-2 hover:bg-white/10 transition-colors ${
                    'gold' in link && link.gold
                      ? 'font-semibold text-[#C9A84C]'
                      : 'highlight' in link && link.highlight
                      ? 'font-semibold text-[#C9A84C]'
                      : 'text-white/75'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="border-t border-white/10 pt-3 flex flex-col gap-3">
              {championships.length > 1 && selectedChampionship && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">Championship:</span>
                  <ChampionshipSelector championships={championships} selectedId={selectedChampionship.id} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Timezone:</span>
                <TimezoneSelector timezone={user.timezone} />
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-white/15 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
