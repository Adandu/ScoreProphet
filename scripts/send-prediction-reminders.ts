import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { sendPredictionReminderEmail } from '../src/lib/email'

const MAX_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000
const FALLBACK_TZ = 'Europe/Bucharest'
const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINAL: 'Quarter-Finals',
  SEMI_FINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function formatMatchTime(date: Date, timezone = FALLBACK_TZ): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  }
  try {
    return new Intl.DateTimeFormat('en-GB', options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: FALLBACK_TZ }).format(date)
  }
}

function arePredictionsConfigured(
  match: { stage: string },
  predictions: Array<{ type: string }>,
  hasAdvancePrediction: boolean,
  doubleChanceEnabled: boolean,
): boolean {
  const visible = doubleChanceEnabled ? predictions : predictions.filter(p => p.type !== 'DOUBLE_CHANCE')
  const hasResult = visible.some(p => p.type === 'SINGLE_OUTCOME' || p.type === 'DOUBLE_CHANCE')
  const hasExact = visible.some(p => p.type === 'EXACT_SCORE')
  const hasAdvance = match.stage === 'GROUP' || hasAdvancePrediction
  return hasResult && hasExact && hasAdvance
}

async function main() {
  const appUrl = getRequiredEnv('APP_URL').replace(/\/$/, '')
  const now = new Date()
  const dueBefore = new Date(now.getTime() + MAX_REMINDER_LEAD_MS)

  const matches = await prisma.match.findMany({
    where: { status: 'SCHEDULED', kickoff: { gt: now, lte: dueBefore } },
    orderBy: { kickoff: 'asc' },
  })

  if (matches.length === 0) {
    console.log('[prediction-reminders] No matches due within reminder window.')
    return
  }

  const championships = await prisma.championship.findMany({
    where: { isActive: true },
    select: { id: true, name: true, doubleChanceEnabled: true },
  })

  let sent = 0

  for (const championship of championships) {
    const matchIds = matches.map(m => m.id)

    const [members, sentReminders, allPredictions, allAdvances] = await Promise.all([
      prisma.championshipMember.findMany({
        where: {
          championshipId: championship.id,
          user: { predictionReminderEnabled: true, email: { not: null } },
        },
        include: { user: { select: { id: true, email: true, timezone: true, predictionReminderHoursBefore: true } } },
      }),
      prisma.predictionReminder.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds } },
        select: { userId: true, matchId: true },
      }),
      prisma.prediction.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds } },
        select: { userId: true, matchId: true, type: true },
      }),
      prisma.knockoutAdvance.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds } },
        select: { userId: true, matchId: true },
      }),
    ])

    if (members.length === 0) continue

    const reminderSet = new Set(sentReminders.map(r => `${r.userId}:${r.matchId}`))
    const predictionsByKey = new Map<string, Array<{ type: string }>>()
    for (const p of allPredictions) {
      const key = `${p.userId}:${p.matchId}`
      const list = predictionsByKey.get(key) ?? []
      list.push(p)
      predictionsByKey.set(key, list)
    }
    const advanceSet = new Set(allAdvances.map(a => `${a.userId}:${a.matchId}`))

    for (const match of matches) {
      for (const member of members) {
        if (!member.user.email) continue

        const userLeadMs = (member.user.predictionReminderHoursBefore ?? 12) * 60 * 60 * 1000
        if (match.kickoff.getTime() - now.getTime() > userLeadMs) continue

        const key = `${member.user.id}:${match.id}`
        if (reminderSet.has(key)) continue

        const predictions = predictionsByKey.get(key) ?? []
        const hasAdvance = advanceSet.has(key)
        if (arePredictionsConfigured(match, predictions, hasAdvance, championship.doubleChanceEnabled)) continue

        await sendPredictionReminderEmail(
          member.user.email,
          {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeTeamCrest: match.homeTeamCrest ?? undefined,
            awayTeamCrest: match.awayTeamCrest ?? undefined,
            kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone ?? undefined),
            stageLabel: STAGE_LABELS[match.stage] ?? match.stage,
            championshipName: championship.name,
          },
          `${appUrl}/championships/${championship.id}/predictions`,
        )

        await prisma.predictionReminder.create({
          data: { userId: member.user.id, matchId: match.id, championshipId: championship.id },
        })
        reminderSet.add(key)
        sent++
      }
    }
  }

  console.log(`[prediction-reminders] Sent ${sent} reminders for ${matches.length} due matches.`)
  try {
    await prisma.jobStatus.upsert({
      where: { jobName: 'prediction-reminders' },
      update: { lastRunAt: new Date(), lastResult: 'ok', runCount: { increment: 1 } },
      create: { jobName: 'prediction-reminders', lastRunAt: new Date(), lastResult: 'ok', runCount: 1 },
    })
  } catch {}
}

main()
  .catch(async (err) => {
    console.error('[prediction-reminders] Fatal error:', err)
    try {
      await prisma.jobStatus.upsert({
        where: { jobName: 'prediction-reminders' },
        update: { lastRunAt: new Date(), lastResult: String(err?.message ?? err), runCount: { increment: 1 } },
        create: { jobName: 'prediction-reminders', lastRunAt: new Date(), lastResult: String(err?.message ?? err), runCount: 1 },
      })
    } catch {}
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
