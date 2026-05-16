import nodemailer from 'nodemailer'
import { Resvg } from '@resvg/resvg-js'

export interface PredictionReminderEmailMatch {
  homeTeam: string
  awayTeam: string
  homeTeamCrest?: string
  awayTeamCrest?: string
  kickoffLabel: string
  stageLabel: string
  championshipName: string
}

const crestCache = new Map<string, string>()

const ALLOWED_CREST_HOSTS = new Set([
  'crests.football-data.org',
  'media.api-sports.io',
  'upload.wikimedia.org',
  'flags.fmcdn.net',
])
const MAX_CREST_BYTES = 512 * 1024

async function crestToDataUri(url: string | undefined): Promise<string | null> {
  if (!url || !url.startsWith('https://')) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (!ALLOWED_CREST_HOSTS.has(parsed.hostname)) return null
  if (crestCache.has(url)) return crestCache.get(url)!
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength > MAX_CREST_BYTES) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('svg') || url.toLowerCase().endsWith('.svg')) {
      const svg = await res.text()
      if (svg.length > MAX_CREST_BYTES) return null
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 56 } })
      const png = resvg.render().asPng()
      const uri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`
      if (crestCache.size < 500) crestCache.set(url, uri)
      return uri
    }
    if (contentType.includes('png') || contentType.includes('jpeg')) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_CREST_BYTES) return null
      const mime = contentType.includes('jpeg') ? 'image/jpeg' : 'image/png'
      const uri = `data:${mime};base64,${buf.toString('base64')}`
      if (crestCache.size < 500) crestCache.set(url, uri)
      return uri
    }
  } catch {
    // network or conversion failure — fall through to no image
  }
  return null
}

function getRequiredEnv(name: string): string {
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
    requireTLS: port !== 465,
    auth: { user, pass },
  })
}

function getFromAddress() {
  return process.env.SMTP_FROM ?? getRequiredEnv('SMTP_USER')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const transporter = createTransporter()

  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: 'Reset your ScoreProphet password',
    text: `Use this link to reset your ScoreProphet password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request it, you can ignore this email.`,
    html: `
      <p>Use this link to reset your ScoreProphet password:</p>
      <p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
      <p>This link expires in 1 hour. If you did not request it, you can ignore this email.</p>
    `,
  })
}

function crestImg(dataUri: string | null, teamName: string): string {
  if (!dataUri) return ''
  return `<img src="${dataUri}" width="48" height="48" alt="${escapeHtml(teamName)}" style="display:block;margin:0 auto 10px;max-width:48px;height:48px;object-fit:contain;">`
}

function buildReminderHtml(match: PredictionReminderEmailMatch, predictionsUrl: string, homeCrest: string | null, awayCrest: string | null): string {
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
                <td align="center">
                  <span style="display:inline-block;background-color:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;color:#F2D27A;letter-spacing:0.03em;">${escapeHtml(match.stageLabel)}</span>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
              <tr>
                <td width="44%" align="center" style="vertical-align:middle;padding:12px 0;">
                  ${crestImg(homeCrest, match.homeTeam)}
                  <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;text-align:center;">${escapeHtml(match.homeTeam)}</p>
                </td>
                <td width="12%" align="center" style="vertical-align:middle;">
                  <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.25);letter-spacing:0.15em;text-transform:uppercase;">vs</span>
                </td>
                <td width="44%" align="center" style="vertical-align:middle;padding:12px 0;">
                  ${crestImg(awayCrest, match.awayTeam)}
                  <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;text-align:center;">${escapeHtml(match.awayTeam)}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td align="center" style="padding:12px 0 4px;">
                  <span style="display:inline-block;background-color:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.35);border-radius:6px;padding:8px 18px;font-size:14px;font-weight:600;color:#F2D27A;">&#128197; ${escapeHtml(match.kickoffLabel)}</span>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr><td style="border-top:1px solid rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td style="font-size:12px;color:rgba(255,255,255,0.4);">Competition</td>
                <td align="right" style="font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;">${escapeHtml(match.championshipName)}</td>
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

export async function sendPredictionReminderEmail(to: string, match: PredictionReminderEmailMatch, predictionsUrl: string) {
  const transporter = createTransporter()
  const teams = `${match.homeTeam} vs ${match.awayTeam}`
  const subject = `ScoreProphet reminder: set your prediction for ${teams}`
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
    from: getFromAddress(),
    to,
    subject,
    text,
    html: buildReminderHtml(match, predictionsUrl, homeCrest, awayCrest),
  })
}
