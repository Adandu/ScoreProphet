import Link from 'next/link'

export function ChampionshipPageNav({ championshipId, name }: { championshipId: number; name: string }) {
  const links = [
    { href: `/championships/${championshipId}/predictions`, label: 'Predictions' },
    { href: `/championships/${championshipId}/pending`, label: 'Pending' },
    { href: `/championships/${championshipId}/results`, label: 'Results' },
    { href: `/championships/${championshipId}/leaderboard`, label: 'Leaderboard' },
  ]

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <h1 className="text-2xl font-bold text-white">{name}</h1>
      <div className="flex gap-3 text-sm text-white/60">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-white">
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
