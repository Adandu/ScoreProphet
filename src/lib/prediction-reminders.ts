import { prisma } from '@/lib/db'
import { formatMatchTime } from '@/lib/format-date'
import { sendPredictionReminderEmail } from '@/lib/email'
import { arePredictionsConfigured, predictionReminderWindow, stageLabel } from '@/lib/prediction-reminder-rules'

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
      select: { id: true, name: true, doubleChanceEnabled: true },
    }),
  ])

  if (matches.length === 0) return { matchesChecked: 0, sent: 0 }

  let sent = 0
  const matchIds = matches.map((match) => match.id)

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
      include: { user: true },
    })

    if (members.length === 0) continue
    const userIds = members.map((member) => member.userId)

    const [existingReminders, allPredictions, allAdvances] = await Promise.all([
      prisma.predictionReminder.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds }, userId: { in: userIds } },
        select: { userId: true, matchId: true },
      }),
      prisma.prediction.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds }, userId: { in: userIds } },
        select: { userId: true, matchId: true, type: true, value: true },
      }),
      prisma.knockoutAdvance.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds }, userId: { in: userIds } },
        select: { userId: true, matchId: true },
      }),
    ])

    const reminderSet = new Set(existingReminders.map((reminder) => `${reminder.userId}:${reminder.matchId}`))
    const predictionsByKey = new Map<string, typeof allPredictions>()
    for (const prediction of allPredictions) {
      const key = `${prediction.userId}:${prediction.matchId}`
      const predictions = predictionsByKey.get(key) ?? []
      predictions.push(prediction)
      predictionsByKey.set(key, predictions)
    }
    const advanceSet = new Set(allAdvances.map((advance) => `${advance.userId}:${advance.matchId}`))

    for (const match of matches) {
      for (const member of members) {
        if (!member.user.email) continue

        const key = `${member.userId}:${match.id}`
        if (reminderSet.has(key)) continue

        const predictions = predictionsByKey.get(key) ?? []
        if (arePredictionsConfigured(match, predictions, advanceSet.has(key), championship.doubleChanceEnabled)) {
          continue
        }

        const predictionsUrl = `${normalizedAppUrl}/championships/${member.championshipId}/predictions`
        await sendPredictionReminderEmail(
          member.user.email,
          {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeTeamCrest: match.homeTeamCrest || undefined,
            awayTeamCrest: match.awayTeamCrest || undefined,
            kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone),
            stageLabel: stageLabel(match.stage),
            championshipName: championship.name,
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
        reminderSet.add(key)
        sent++
      }
    }
  }

  return { matchesChecked: matches.length, sent }
}
