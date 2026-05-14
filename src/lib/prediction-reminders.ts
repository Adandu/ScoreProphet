import { prisma } from '@/lib/db'
import { formatMatchTime } from '@/lib/format-date'
import { sendPredictionReminderEmail } from '@/lib/email'
import { arePredictionsConfigured, predictionReminderWindow, STAGE_LABELS } from '@/lib/prediction-reminder-rules'

export async function sendDuePredictionReminders(appUrl: string, now = new Date()) {
  const normalizedAppUrl = appUrl.replace(/\/$/, '')

  const [matches, championships] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: 'SCHEDULED',
        kickoff: predictionReminderWindow(now),
      },
      orderBy: { kickoff: 'asc' },
    }),
    prisma.championship.findMany({
      where: { isActive: true },
      select: { id: true },
    }),
  ])

  let sent = 0

  for (const championship of championships) {
    // Fetch members once per championship, scoped to that championship
    const members = await prisma.championshipMember.findMany({
      where: {
        championshipId: championship.id,
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

    if (members.length === 0) continue

    for (const match of matches) {
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

        const predictionsUrl = `${normalizedAppUrl}/championships/${member.championshipId}/predictions`
        await sendPredictionReminderEmail(
          member.user.email,
          {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone),
            stageLabel: STAGE_LABELS[match.stage],
            championshipName: member.championship.name,
          },
          predictionsUrl
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
  }

  return { matchesChecked: matches.length, sent }
}
