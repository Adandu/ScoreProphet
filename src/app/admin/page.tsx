import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { AdminClient } from './_admin-client'

export default async function AdminPage() {
  const session = await requireAdmin()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, users, championships] = await Promise.all([
    prisma.match.findMany({ orderBy: { kickoff: 'asc' } }),
    prisma.user.findMany({ orderBy: { username: 'asc' } }),
    prisma.championship.findMany({
      orderBy: { name: 'asc' },
      include: { members: true },
    }),
  ])

  return (
    <AdminClient
      timezone={timezone}
      matches={matches.map((m) => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoff: m.kickoff.toISOString(),
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        winnerTeam: m.winnerTeam,
        stage: m.stage,
        adminOverride: m.adminOverride,
      }))}
      users={users.map((u) => ({ id: u.id, username: u.username, isAdmin: u.isAdmin }))}
      championships={championships.map((championship) => ({
        id: championship.id,
        name: championship.name,
        description: championship.description,
        isActive: championship.isActive,
        doubleChanceEnabled: championship.doubleChanceEnabled,
        userIds: championship.members.map((member) => member.userId),
      }))}
    />
  )
}
