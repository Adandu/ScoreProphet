import nodemailer from 'nodemailer'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

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

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMatchTime(date, timezone = FALLBACK_TZ) {
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }

  try {
    return new Intl.DateTimeFormat('en-GB', options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: FALLBACK_TZ }).format(date)
  }
}

function arePredictionsConfigured(match, predictions, hasAdvancePrediction, doubleChanceEnabled) {
  const visiblePredictions = doubleChanceEnabled
    ? predictions
    : predictions.filter((prediction) => prediction.type !== 'DOUBLE_CHANCE')
  const hasResultPrediction = visiblePredictions.some(
    (prediction) => prediction.type === 'SINGLE_OUTCOME' || prediction.type === 'DOUBLE_CHANCE'
  )
  const hasExactPrediction = visiblePredictions.some((prediction) => prediction.type === 'EXACT_SCORE')
  const hasRequiredAdvancePrediction = match.stage === 'GROUP' || hasAdvancePrediction

  return hasResultPrediction && hasExactPrediction && hasRequiredAdvancePrediction
}

async function sendPredictionReminderEmail(transporter, to, match, predictionsUrl) {
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

  await transporter.sendMail({
    from,
    to,
    subject: `ScoreProphet reminder: set your prediction for ${teams}`,
    text,
    html: `
      <p>Your ScoreProphet predictions are not set for this upcoming match.</p>
      <ul>
        <li><strong>Match:</strong> ${escapeHtml(teams)}</li>
        <li><strong>Competition:</strong> ${escapeHtml(match.championshipName)}</li>
        <li><strong>Stage:</strong> ${escapeHtml(match.stageLabel)}</li>
        <li><strong>Kickoff:</strong> ${escapeHtml(match.kickoffLabel)}</li>
      </ul>
      <p><a href="${escapeHtml(predictionsUrl)}">Open predictions page</a></p>
    `,
  })
}

async function main() {
  const appUrl = getRequiredEnv('APP_URL').replace(/\/$/, '')
  const now = new Date()
  const dueBefore = new Date(now.getTime() + REMINDER_LEAD_MS)
  const transporter = createTransporter()

  const matches = await prisma.match.findMany({
    where: {
      status: 'SCHEDULED',
      kickoff: { gt: now, lte: dueBefore },
    },
    orderBy: { kickoff: 'asc' },
  })

  let sent = 0

  for (const match of matches) {
    const members = await prisma.championshipMember.findMany({
      where: {
        championship: { isActive: true },
        user: {
          predictionReminderEnabled: true,
          email: { not: null },
        },
      },
      include: {
        championship: true,
        user: true,
      },
    })

    for (const member of members) {
      if (!member.user.email) continue

      const existingReminder = await prisma.predictionReminder.findUnique({
        where: {
          userId_matchId_championshipId: {
            userId: member.userId,
            matchId: match.id,
            championshipId: member.championshipId,
          },
        },
      })
      if (existingReminder) continue

      const [predictions, advance] = await Promise.all([
        prisma.prediction.findMany({
          where: {
            userId: member.userId,
            matchId: match.id,
            championshipId: member.championshipId,
          },
          select: { type: true },
        }),
        prisma.knockoutAdvance.findUnique({
          where: {
            userId_matchId_championshipId: {
              userId: member.userId,
              matchId: match.id,
              championshipId: member.championshipId,
            },
          },
        }),
      ])

      if (arePredictionsConfigured(match, predictions, Boolean(advance), member.championship.doubleChanceEnabled)) {
        continue
      }

      await sendPredictionReminderEmail(
        transporter,
        member.user.email,
        {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone),
          stageLabel: STAGE_LABELS[match.stage],
          championshipName: member.championship.name,
        },
        `${appUrl}/championships/${member.championshipId}/predictions`
      )

      await prisma.predictionReminder.create({
        data: {
          userId: member.userId,
          matchId: match.id,
          championshipId: member.championshipId,
        },
      })
      sent++
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
