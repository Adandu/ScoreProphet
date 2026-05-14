import nodemailer from 'nodemailer'

export interface PredictionReminderEmailMatch {
  homeTeam: string
  awayTeam: string
  kickoffLabel: string
  stageLabel: string
  championshipName: string
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
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour. If you did not request it, you can ignore this email.</p>
    `,
  })
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

  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
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
