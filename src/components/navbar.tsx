import Link from 'next/link'
import { logout } from '@/actions/auth'
import { getCurrentUser } from '@/lib/auth'
import { getSelectedChampionship, getUserChampionships } from '@/lib/championships'
import { Button } from '@/components/ui/button'
import { TimezoneSelector } from '@/components/timezone-selector'
import { ChampionshipSelector } from '@/components/championship-selector'

export async function Navbar() {
  const user = await getCurrentUser()
  const championships = user ? await getUserChampionships(user.userId) : []
  const selectedChampionship = user ? await getSelectedChampionship(user.userId) : null

  return (
    <nav className="border-b border-white/10 bg-[#0A1628]/95 backdrop-blur sticky top-0 z-50">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-[#C9A84C] tracking-tight">
          ScoreProphet
        </Link>
        <div className="flex items-center gap-4 text-sm text-white/70">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          {selectedChampionship && (
            <>
              <Link href={`/championships/${selectedChampionship.id}/predictions`} className="hover:text-white transition-colors">Predictions</Link>
              <Link href={`/championships/${selectedChampionship.id}/results`} className="hover:text-white transition-colors">Results</Link>
              <Link href={`/championships/${selectedChampionship.id}/leaderboard`} className="hover:text-white transition-colors">Leaderboard</Link>
            </>
          )}
          <Link href="/tournament" className="hover:text-white transition-colors">Tournament</Link>
          <Link href="/teams" className="hover:text-white transition-colors">Teams</Link>
          {user?.isAdmin && (
            <Link href="/admin" className="text-[#C9A84C] hover:text-[#C9A84C]/80 transition-colors">Admin</Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/50">{user.username}</span>
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
      </div>
    </nav>
  )
}
