import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/navbar'
import { getCurrentUser } from '@/lib/auth'
import { getActiveTournaments, getSelectedTournament } from '@/lib/tournament'
import { getSession } from '@/lib/session'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ScoreProphet — WC 2026 Predictions',
  description: 'Predict World Cup 2026 match outcomes with your friends',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const theme = user?.theme === 'LIGHT' ? 'light' : 'dark'

  const session = await getSession()
  const [activeTournaments, selectedTournament] = await Promise.all([
    getActiveTournaments(),
    getSelectedTournament(session),
  ])

  return (
    <html lang="en" className={theme}>
      <body className={`${inter.className} bg-[#0A1628] text-white`}>
        <Navbar
          activeTournaments={activeTournaments}
          selectedTournamentId={selectedTournament?.id ?? null}
          isArchivedView={selectedTournament?.isArchived ?? false}
        />
        <main className="mx-auto w-full max-w-[90rem] px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
