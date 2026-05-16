import nodemailer from 'nodemailer'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { buildReminderHtml, crestToDataUri } from './lib/email-template.mjs'

const REMINDER_LEAD_MS = 12 * 60 * 60 * 1000
const FALLBACK_TZ = 'Europe/Bucharest'
const STAGE_LABELS = {
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

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function createTransporter() {
  const host = getRequiredEnv('SMTP_HOST')
  const port = Number(process.env.SMTP_PORT ?? '465')
  const user = getRequiredEnv('SMTP_USER')
  const pass = getRequiredEnv('SMTP_PASSWORD')
  return nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass } })
}

function formatMatchTime(date, timezone = FALLBACK_TZ) {
  const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone }
  try {
    return new Intl.DateTimeFormat('en-GB', options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: FALLBACK_TZ }).format(date)
  }
}

function arePredictionsConfigured(match, predictions, hasAdvancePrediction, doubleChanceEnabled) {
  const visible = doubleChanceEnabled ? predictions : predictions.filter(p => p.type !== 'DOUBLE_CHANCE')
  const hasResult = visible.some(p => p.type === 'SINGLE_OUTCOME' || p.type === 'DOUBLE_CHANCE')
  const hasExact = visible.some(p => p.type === 'EXACT_SCORE')
  const hasAdvance = match.stage === 'GROUP' || hasAdvancePrediction
  return hasResult && hasExact && hasAdvance
}

async function sendReminderEmail(transporter, to, match, predictionsUrl) {
  const from = process.env.SMTP_FROM ?? getRequiredEnv('SMTP_USER')
  const teams = `${match.homeTeam} vs ${match.awayTeam}`
  const text = [
    'Your ScoreProphet predictions are not set for this upcoming match.',
    '',
    `Match: ${teams}`,
    `Competition: ${match.championshipName}`,
    `Stage: ${match.stageLabel}`,
    `Kickoff: ${match.kickoffLabel}`,
    '',
    `Set your predictions here: ${predictionsUrl}`,
  ].join('\n')
  const [homeCrest, awayCrest] = await Promise.all([
    crestToDataUri(match.homeTeamCrest),
    crestToDataUri(match.awayTeamCrest),
  ])
  await transporter.sendMail({
    from, to,
    subject: `ScoreProphet reminder: set your prediction for ${teams}`,
    text,
    html: buildReminderHtml(match, predictionsUrl, homeCrest, awayCrest),
  })
}

async function main() {
  const appUrl = getRequiredEnv('APP_URL').replace(/\/$/, '')
  const now = new Date()
  const dueBefore = new Date(now.getTime() + REMINDER_LEAD_MS)
  const transporter = createTransporter()

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
        include: { user: { select: { id: true, email: true, timezone: true } } },
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
    const predictionsByKey = new Map()
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

        const key = `${member.user.id}:${match.id}`
        if (reminderSet.has(key)) continue

        const predictions = predictionsByKey.get(key) ?? []
        const hasAdvance = advanceSet.has(key)
        if (arePredictionsConfigured(match, predictions, hasAdvance, championship.doubleChanceEnabled)) continue

        await sendReminderEmail(
          transporter,
          member.user.email,
          {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeTeamCrest: match.homeTeamCrest || undefined,
            awayTeamCrest: match.awayTeamCrest || undefined,
            kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone),
            stageLabel: STAGE_LABELS[match.stage] ?? match.stage,
            championshipName: championship.name,
          },
          `${appUrl}/championships/${championship.id}/predictions`
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
}

main()
  .catch((err) => {
    console.error('[prediction-reminders] Fatal error:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
