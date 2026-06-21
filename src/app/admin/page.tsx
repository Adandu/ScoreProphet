import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { AdminClient } from './_admin-client'

export default async function AdminPage() {
  const session = await requireAdmin()
  const timezone = session.timezone ?? 'Europe/Bucharest'

  const [matches, users, championships, auditLogs, jobStatuses] = await Promise.all([
    prisma.match.findMany({
      orderBy: { kickoff: 'asc' },
      select: {
        id: true, homeTeam: true, awayTeam: true, kickoff: true, status: true,
        homeScore: true, awayScore: true, winnerTeam: true, scoreDuration: true,
        stage: true, adminOverride: true,
      },
    }),
    prisma.user.findMany({
      orderBy: { username: 'asc' },
      select: { id: true, username: true, isAdmin: true },
    }),
    prisma.championship.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, description: true, isActive: true, doubleChanceEnabled: true,
        members: { select: { userId: true } },
        managers: { select: { userId: true } },
      },
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, adminUsername: true, action: true, entityType: true,
        entityId: true, details: true, createdAt: true,
      },
    }),
    prisma.jobStatus.findMany({ orderBy: { lastRunAt: 'desc' } }),
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
        scoreDuration: m.scoreDuration,
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
        managerUserIds: championship.managers.map((manager) => manager.userId),
      }))}
      auditLogs={auditLogs.map((log) => ({
        id: log.id,
        adminUsername: log.adminUsername,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
      }))}
      jobStatuses={jobStatuses.map((j) => ({
        jobName: j.jobName,
        lastRunAt: j.lastRunAt.toISOString(),
        lastResult: j.lastResult,
        runCount: j.runCount,
      }))}
    />
  )
}
