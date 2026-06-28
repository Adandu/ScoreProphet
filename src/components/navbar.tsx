import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getManagedChampionships, getSelectedChampionship, getUserChampionships } from '@/lib/championships'
import { TimezoneSelector } from '@/components/timezone-selector'
import { ChampionshipSelector } from '@/components/championship-selector'
import { UsernameDropdown } from '@/components/username-dropdown'
import { MobileMenu } from '@/components/mobile-menu'
import { TournamentSwitcher } from '@/components/tournament-switcher'
import { prisma } from '@/lib/db'
import type { Tournament } from '@prisma/client'

interface NavbarProps {
  activeTournaments?: Tournament[]
  selectedTournamentId?: number | null
  isArchivedView?: boolean
}

export async function Navbar({ activeTournaments = [], selectedTournamentId = null, isArchivedView = false }: NavbarProps) {
  const user = await getCurrentUser()
  const [championships, selectedChampionship, managedChampionships] = user
    ? await Promise.all([
        getUserChampionships(user.userId, selectedTournamentId ?? undefined),
        getSelectedChampionship(user.userId, selectedTournamentId ?? undefined),
        getManagedChampionships(user.userId),
      ])
    : [[], null, []]
  const canManageChampionships = user?.isAdmin || managedChampionships.length > 0
  const now = new Date()
  const soonCutoff = new Date(now.getTime() + 15 * 60 * 1000)
  const graceStart = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const hasLiveMatch = await prisma.match
    .count({
      where: {
        OR: [
          { status: 'LIVE' },
          { status: 'SCHEDULED', kickoff: { gte: graceStart, lte: soonCutoff } },
        ],
      },
    })
    .then((n) => n > 0)

  return (
    <nav className="border-b border-white/10 bg-[#0A1628]/95 backdrop-blur sticky top-0 z-50 caret-transparent">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-[#C9A84C] tracking-tight">
          ScoreProphet
        </Link>

        {user ? (
          <>
            {/* Desktop nav links */}
            <div className="hidden items-center gap-5 text-sm text-white/70 lg:flex">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              {hasLiveMatch && !isArchivedView && (
                <Link
                  href="/live"
                  className="flex items-center gap-1.5 font-semibold text-red-400 hover:text-red-300 transition-colors"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Live
                </Link>
              )}
              {selectedChampionship && (
                <Link
                  href={`/championships/${selectedChampionship.id}/predictions`}
                  className="font-semibold text-[#C9A84C] hover:text-[#F2D27A] transition-colors"
                >
                  {selectedChampionship.name}
                </Link>
              )}
              <Link href="/tournament" className="hover:text-white transition-colors">Tournament</Link>
              <Link href="/instructions" className="hover:text-white transition-colors">How to Play</Link>
            </div>

            {/* Desktop right-side controls */}
            <div className="hidden items-center gap-3 lg:flex">
              <TournamentSwitcher tournaments={activeTournaments} selectedId={selectedTournamentId} />
              {championships.length > 1 && selectedChampionship && (
                <ChampionshipSelector
                  championships={championships.map((c) => ({ id: c.id, name: c.name }))}
                  selectedId={selectedChampionship.id}
                />
              )}
              <TimezoneSelector timezone={user.timezone} />
              <UsernameDropdown
                username={user.username}
                isAdmin={user.isAdmin}
                canManage={canManageChampionships}
              />
            </div>
          </>
        ) : (
          <>
            <div className="hidden lg:block" />
            <div className="hidden items-center gap-2 lg:flex sm:gap-3">
              <Link href="/login">
                <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/70 hover:text-white bg-transparent transition-colors">
                  Login
                </button>
              </Link>
              <Link href="/register">
                <button type="button" className="rounded-md bg-[#C9A84C] px-3 py-1.5 text-sm font-semibold text-[#0A1628] hover:bg-[#C9A84C]/90 transition-colors">
                  Register
                </button>
              </Link>
            </div>
          </>
        )}

        <MobileMenu
          user={user}
          championships={championships.map((c) => ({ id: c.id, name: c.name }))}
          selectedChampionship={selectedChampionship}
          hasLiveMatch={Boolean(user && hasLiveMatch && !isArchivedView)}
          canManageChampionships={canManageChampionships}
          activeTournaments={activeTournaments}
          selectedTournamentId={selectedTournamentId}
        />
      </div>
    </nav>
  )
}
