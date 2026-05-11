import Link from 'next/link'
import { logout } from '@/actions/auth'
import { getCurrentUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export async function Navbar() {
  const user = await getCurrentUser()

  return (
    <nav className="border-b border-white/10 bg-[#0A1628]/95 backdrop-blur sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold text-[#C9A84C] tracking-tight">
          ScoreProphet
        </Link>
        <div className="flex items-center gap-4 text-sm text-white/70">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/predictions" className="hover:text-white transition-colors">Predictions</Link>
          <Link href="/results" className="hover:text-white transition-colors">Results</Link>
          <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
          <Link href="/teams" className="hover:text-white transition-colors">Teams</Link>
          {user?.isAdmin && (
            <Link href="/admin" className="text-[#C9A84C] hover:text-[#C9A84C]/80 transition-colors">Admin</Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/50">{user.username}</span>
              <form action={logout}>
                <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white bg-transparent">
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
