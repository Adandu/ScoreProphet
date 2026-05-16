'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { logout } from '@/actions/auth'
import { Button } from '@/components/ui/button'
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

  const championshipLinks = selectedChampionship
    ? [
        { href: `/championships/${selectedChampionship.id}/predictions`, label: 'Predictions' },
        { href: `/championships/${selectedChampionship.id}/results`, label: 'Results' },
        { href: `/championships/${selectedChampionship.id}/leaderboard`, label: 'Leaderboard' },
      ]
    : []

  const links = [
    { href: '/', label: 'Home' },
    ...championshipLinks,
    { href: '/tournament', label: 'Tournament' },
    { href: '/teams', label: 'Teams' },
    ...(user ? [{ href: '/profile', label: 'Profile' }] : []),
    ...(canManageChampionships ? [{ href: '/manage', label: 'Manage' }] : []),
    ...(user?.isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ]

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full border-b border-white/10 bg-[#0A1628] px-4 py-4 shadow-2xl">
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 text-sm text-white/75">
              {hasLiveMatch && (
                <Link
                  href="/live"
                  onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2 hover:bg-white/10 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {user ? (
              <div className="grid gap-3 border-t border-white/10 pt-4">
                <span className="text-sm text-white/50">{user.username}</span>
                {championships.length > 0 && selectedChampionship && (
                  <ChampionshipSelector championships={championships} selectedId={selectedChampionship.id} />
                )}
                <TimezoneSelector timezone={user.timezone} />
                <form action={logout}>
                  <Button type="submit" variant="outline" size="sm" className="w-full border-white/20 text-white/70 hover:text-white bg-transparent">
                    Logout
                  </Button>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                <Link href="/login" onClick={() => setOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full border-white/20 text-white/70 hover:text-white bg-transparent">
                    Login
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setOpen(false)}>
                  <Button size="sm" className="w-full bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 font-semibold">
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
