import Link from 'next/link'
import { logout } from '@/actions/auth'
import { getCurrentUser } from '@/lib/auth'
import { getManagedChampionships, getSelectedChampionship, getUserChampionships } from '@/lib/championships'
import { Button } from '@/components/ui/button'
import { TimezoneSelector } from '@/components/timezone-selector'
import { ChampionshipSelector } from '@/components/championship-selector'
import { MobileMenu } from '@/components/mobile-menu'
import { prisma } from '@/lib/db'

export async function Navbar() {
  const user = await getCurrentUser()
  const [championships, selectedChampionship, managedChampionships] = user
    ? await Promise.all([
        getUserChampionships(user.userId),
        getSelectedChampionship(user.userId),
        getManagedChampionships(user.userId),
      ])
    : [[], null, []]
  const canManageChampionships = user?.isAdmin || managedChampionships.length > 0
  const now = new Date()
  const soonCutoff = new Date(now.getTime() + 15 * 60 * 1000)
  const hasLiveMatch = await prisma.match
    .count({
      where: {
        OR: [
          { status: 'LIVE' },
          { status: 'SCHEDULED', kickoff: { gte: now, lte: soonCutoff } },
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
          <div className="hidden items-center gap-4 text-sm text-white/70 lg:flex">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            {hasLiveMatch && (
              <Link href="/live" className="flex items-center gap-1.5 font-semibold text-red-400 hover:text-red-300 transition-colors">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Live
              </Link>
            )}
            {selectedChampionship && (
              <>
                <Link href={`/championships/${selectedChampionship.id}/predictions`} className="hover:text-white transition-colors">Predictions</Link>
                <Link href={`/championships/${selectedChampionship.id}/results`} className="hover:text-white transition-colors">Results</Link>
                <Link href={`/championships/${selectedChampionship.id}/leaderboard`} className="hover:text-white transition-colors">Leaderboard</Link>
              </>
            )}
            <Link href="/tournament" className="hover:text-white transition-colors">Tournament</Link>
            <Link href="/teams" className="hover:text-white transition-colors">Teams</Link>
            <Link href="/instructions" className="hover:text-white transition-colors">How to Play</Link>
            <Link href="/profile" className="hover:text-white transition-colors">Profile</Link>
            {canManageChampionships && (
              <Link href="/manage" className="text-[#C9A84C] hover:text-[#C9A84C]/80 transition-colors">Manage</Link>
            )}
            {user.isAdmin && (
              <Link href="/admin" className="text-[#C9A84C] hover:text-[#C9A84C]/80 transition-colors">Admin</Link>
            )}
          </div>
        ) : (
          <div className="hidden lg:block" />
        )}
        <div className={user ? 'hidden items-center gap-3 lg:flex' : 'flex items-center gap-2 sm:gap-3'}>
          {user ? (
            <>
              <Link href="/profile" className="text-sm text-white/50 hover:text-white">{user.username}</Link>
              {championships.length > 0 && selectedChampionship && (
                <ChampionshipSelector championships={championships} selectedId={selectedChampionship.id} />
              )}
              <TimezoneSelector timezone={user.timezone} />
              <form action={logout}>
                <Button type="submit" variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent">
                  Logout
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-[#C9A84C] text-[#0A1628] hover:bg-[#C9A84C]/90 font-semibold">
                  Register
                </Button>
              </Link>
            </>
          )}
        </div>
        <MobileMenu user={user} championships={championships} selectedChampionship={selectedChampionship} hasLiveMatch={Boolean(user && hasLiveMatch)} canManageChampionships={canManageChampionships} />
      </div>
    </nav>
  )
}
