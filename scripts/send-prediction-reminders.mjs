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
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function crestImg(url, alt) {
  if (!url || !url.startsWith('http')) {
    return '<div style="width:48px;height:48px;background:rgba(255,255,255,0.08);border-radius:4px;margin:0 auto 8px;"></div>'
  }
  return `<img src="${escapeHtml(url)}" width="48" height="48" alt="${escapeHtml(alt)}" style="display:block;margin:0 auto 8px;max-width:48px;height:48px;object-fit:contain;">`
}

function buildReminderHtml(match, predictionsUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>ScoreProphet Reminder</title></head>
<body style="margin:0;padding:0;background-color:#0A1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A1628;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <tr>
          <td align="center" style="padding-bottom:8px;">
            <span style="font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:0.06em;">ScoreProphet</span>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">Prediction reminder</p>
          </td>
        </tr>

        <tr>
          <td style="background-color:#111c2e;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px 28px;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td>
                  <span style="display:inline-block;background-color:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;color:#F2D27A;">${escapeHtml(match.stageLabel)}</span>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="font-size:12px;color:rgba(255,255,255,0.45);">${escapeHtml(match.kickoffLabel)}</span>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td width="44%" align="center" style="vertical-align:middle;padding:8px 0;">
                  ${crestImg(match.homeTeamCrest, match.homeTeam)}
                  <p style="margin:0;font-size:14px;font-weight:700;color:#ffffff;text-align:center;">${escapeHtml(match.homeTeam)}</p>
                </td>
                <td width="12%" align="center" style="vertical-align:middle;">
                  <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.25);letter-spacing:0.15em;text-transform:uppercase;">vs</span>
                </td>
                <td width="44%" align="center" style="vertical-align:middle;padding:8px 0;">
                  ${crestImg(match.awayTeamCrest, match.awayTeam)}
                  <p style="margin:0;font-size:14px;font-weight:700;color:#ffffff;text-align:center;">${escapeHtml(match.awayTeam)}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr><td style="border-top:1px solid rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td style="font-size:12px;color:rgba(255,255,255,0.4);padding-bottom:4px;">Competition</td>
                <td align="right" style="font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;padding-bottom:4px;">${escapeHtml(match.championshipName)}</td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <a href="${escapeHtml(predictionsUrl)}" style="display:inline-block;background-color:#C9A84C;color:#0A1628;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.02em;">Set my predictions</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;">
              You're receiving this because prediction reminders are enabled on your account.<br>
              You can disable them in your profile settings.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
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
  await transporter.sendMail({
    from, to,
    subject: `ScoreProphet reminder: set your prediction for ${teams}`,
    text,
    html: buildReminderHtml(match, predictionsUrl),
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

  // Group matches by championship via a single members query per championship (fixes N+1)
  const championships = await prisma.championship.findMany({
    where: { isActive: true },
    select: { id: true, name: true, doubleChanceEnabled: true },
  })

  let sent = 0

  for (const championship of championships) {
    const members = await prisma.championshipMember.findMany({
      where: {
        championshipId: championship.id,
        user: { predictionReminderEnabled: true, email: { not: null } },
      },
      include: { user: { select: { id: true, email: true, timezone: true } } },
    })
    if (members.length === 0) continue

    for (const match of matches) {
      for (const member of members) {
        if (!member.user.email) continue

        const existingReminder = await prisma.predictionReminder.findUnique({
          where: { userId_matchId_championshipId: { userId: member.user.id, matchId: match.id, championshipId: championship.id } },
        })
        if (existingReminder) continue

        const [predictions, advance] = await Promise.all([
          prisma.prediction.findMany({
            where: { userId: member.user.id, matchId: match.id, championshipId: championship.id },
            select: { type: true },
          }),
          prisma.knockoutAdvance.findUnique({
            where: { userId_matchId_championshipId: { userId: member.user.id, matchId: match.id, championshipId: championship.id } },
          }),
        ])

        if (arePredictionsConfigured(match, predictions, Boolean(advance), championship.doubleChanceEnabled)) continue

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
