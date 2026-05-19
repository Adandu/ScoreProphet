'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { calculatePredictionPoints, calculateAdvancePoints, calculateTournamentWinnerPoints } from '@/lib/scoring'
import type { PredictionType } from '@/lib/types'
import { normalizeEmail } from '@/lib/utils'
import { sendPredictionReminderEmail } from '@/lib/email'
import { formatMatchTime } from '@/lib/format-date'
import { getAppUrl } from '@/lib/app-url'
import { STAGE_LABELS } from '@/lib/prediction-reminder-rules'
import { logAdminAction } from '@/lib/audit'

export async function overrideMatchScore(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const homeScore = parseInt(formData.get('homeScore') as string, 10)
  const awayScore = parseInt(formData.get('awayScore') as string, 10)
  const winnerTeam = (formData.get('winnerTeam') as string)?.trim() || null

  if (isNaN(homeScore) || isNaN(awayScore)) return { error: 'Invalid scores' }
  if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) return { error: 'Scores must be between 0 and 20' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.stage !== 'GROUP') {
    if (!winnerTeam) return { error: 'Advancing team is required for knockout matches' }
    if (![match.homeTeam, match.awayTeam].includes(winnerTeam)) return { error: 'Advancing team must match one of the teams in this match' }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      scoreDuration: 'REGULAR',
      regularTimeHomeScore: homeScore,
      regularTimeAwayScore: awayScore,
      fullTimeHomeScore: homeScore,
      fullTimeAwayScore: awayScore,
      extraTimeHomeScore: null,
      extraTimeAwayScore: null,
      penaltiesHomeScore: null,
      penaltiesAwayScore: null,
      homeScore,
      awayScore,
      winnerTeam,
      status: 'FINISHED',
      adminOverride: true,
    },
  })

  await recalculateMatchPoints(matchId)
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'UPDATE_MATCH',
    entityType: 'match',
    entityId: String(matchId),
    details: `${match.homeTeam} ${homeScore}-${awayScore} ${match.awayTeam}`,
  })
  revalidatePath('/admin')
  revalidatePath('/results')
  revalidatePath('/tournament')
  revalidatePath('/leaderboard')
  return { success: true }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function recalculateAllPoints(prevState: unknown) {
  const session = await requireAdmin()
  const matches = await prisma.match.findMany({ where: { status: 'FINISHED' } })
  for (const match of matches) {
    await recalculateMatchPoints(match.id)
  }
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'RECALCULATE_POINTS',
    details: `Recalculated ${matches.length} finished matches`,
  })
  revalidatePath('/results')
  revalidatePath('/leaderboard')
  return { success: true, count: matches.length }
}

async function recalculateMatchPoints(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { predictions: true, advances: true },
  })
  if (!match || match.homeScore === null || match.awayScore === null) return

  const operations = []

  for (const pred of match.predictions) {
    const pts = calculatePredictionPoints(pred.type as PredictionType, pred.value, match.homeScore, match.awayScore)
    operations.push(prisma.prediction.update({ where: { id: pred.id }, data: { pointsAwarded: pts } }))
  }

  for (const advance of match.advances) {
    const pts = match.winnerTeam
      && ['EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(match.scoreDuration)
      ? calculateAdvancePoints(advance.predictedTeam, match.winnerTeam)
      : 0
    operations.push(prisma.knockoutAdvance.update({ where: { id: advance.id }, data: { pointsAwarded: pts } }))
  }

  if (match.stage === 'FINAL' && match.winnerTeam) {
    const winnerPredictions = await prisma.tournamentWinnerPrediction.findMany()
    for (const wp of winnerPredictions) {
      const pts = calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam)
      operations.push(
        prisma.tournamentWinnerPrediction.update({ where: { id: wp.id }, data: { pointsAwarded: pts } })
      )
    }
  }

  if (operations.length > 0) await prisma.$transaction(operations)
}

export async function resetMatchOverride(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  if (!matchId) return { error: 'Missing match ID' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (!match.adminOverride) return { error: 'No override to reset' }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      adminOverride: false,
      status: 'SCHEDULED',
      scoreDuration: 'REGULAR',
      homeScore: null,
      awayScore: null,
      winnerTeam: null,
      regularTimeHomeScore: null,
      regularTimeAwayScore: null,
      fullTimeHomeScore: null,
      fullTimeAwayScore: null,
      extraTimeHomeScore: null,
      extraTimeAwayScore: null,
      penaltiesHomeScore: null,
      penaltiesAwayScore: null,
    },
  })

  await prisma.prediction.updateMany({ where: { matchId }, data: { pointsAwarded: null } })
  await prisma.knockoutAdvance.updateMany({ where: { matchId }, data: { pointsAwarded: null } })

  if (match.stage === 'FINAL') {
    await prisma.tournamentWinnerPrediction.updateMany({ data: { pointsAwarded: null } })
  }

  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'RESET_MATCH_OVERRIDE',
    entityType: 'match',
    entityId: String(matchId),
    details: `${match.homeTeam} vs ${match.awayTeam}`,
  })

  revalidatePath('/admin')
  revalidatePath('/results')
  revalidatePath('/tournament')
  revalidatePath('/leaderboard')
  return { success: true }
}

export async function removeUser(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const userId = parseInt(formData.get('userId') as string, 10)
  if (!userId) return { error: 'Missing user ID' }
  if (userId === session.userId) return { error: 'You cannot remove your own account' }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { error: 'User not found' }
  if (user.isAdmin) return { error: 'Admin users cannot be removed here' }
  await prisma.user.delete({ where: { id: userId } })
  await logAdminAction({
    adminId: session.userId!,
    adminUsername: session.username ?? String(session.userId),
    action: 'DELETE_USER',
    entityType: 'user',
    entityId: String(userId),
    details: `Removed ${user.username}`,
  })
  revalidatePath('/admin')
  return { success: true }
}

export async function sendTestPredictionReminder(prevState: unknown, formData: FormData) {
  const session = await requireAdmin()
  const email = normalizeEmail((formData.get('email') as string) ?? '')

  if (!email) return { error: 'Enter a valid email address' }

  const match = await prisma.match.findFirst({
    where: {
      status: 'SCHEDULED',
      kickoff: { gt: new Date() },
    },
    orderBy: { kickoff: 'asc' },
  })
  if (!match) return { error: 'No upcoming scheduled match found' }

  const championship = await prisma.championship.findFirst({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  if (!championship) return { error: 'No active championship found' }

  const appUrl = await getAppUrl()
  await sendPredictionReminderEmail(
    email,
    {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffLabel: formatMatchTime(match.kickoff, session.timezone ?? 'Europe/Bucharest'),
      stageLabel: STAGE_LABELS[match.stage],
      championshipName: championship.name,
    },
    `${appUrl}/championships/${championship.id}/predictions`
  )

  return { success: true, match: `${match.homeTeam} vs ${match.awayTeam}` }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function syncMatchesFromApi(prevState: unknown) {
  const session = await requireAdmin()
  const { fetchAllMatches, fetchHeadToHead } = await import('@/lib/football-api')
  const h2hDelayMs = parseInt(process.env.FOOTBALL_API_H2H_DELAY_MS ?? '6000', 10)
  try {
    const matches = await fetchAllMatches()
    let synced = 0
    let h2hFetched = 0
    const changedMatchIds = new Set<number>()
    const staleH2HBefore = new Date(Date.now() - 60 * 60 * 1000)

    for (const m of matches) {
      // Read current stored scores to detect changes
      const existing = await prisma.match.findUnique({
        where: { externalId: m.externalId },
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          status: true,
          scoreDuration: true,
          winnerTeam: true,
          headToHeadSyncedAt: true,
          adminOverride: true,
        },
      })

      const scoreFields = existing?.adminOverride ? {} : {
        status: m.status,
        scoreDuration: m.scoreDuration,
        regularTimeHomeScore: m.regularTimeHomeScore,
        regularTimeAwayScore: m.regularTimeAwayScore,
        fullTimeHomeScore: m.fullTimeHomeScore,
        fullTimeAwayScore: m.fullTimeAwayScore,
        extraTimeHomeScore: m.extraTimeHomeScore,
        extraTimeAwayScore: m.extraTimeAwayScore,
        penaltiesHomeScore: m.penaltiesHomeScore,
        penaltiesAwayScore: m.penaltiesAwayScore,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        winnerTeam: m.winnerTeam,
      }

      const upserted = await prisma.match.upsert({
        where: { externalId: m.externalId },
        update: {
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeTeamCrest: m.homeTeamCrest,
          awayTeamCrest: m.awayTeamCrest,
          stage: m.stage,
          group: m.group,
          kickoff: m.kickoff,
          ...scoreFields,
        },
        create: {
          externalId: m.externalId,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeTeamCrest: m.homeTeamCrest,
          awayTeamCrest: m.awayTeamCrest,
          stage: m.stage,
          group: m.group,
          kickoff: m.kickoff,
          status: m.status,
          scoreDuration: m.scoreDuration,
          regularTimeHomeScore: m.regularTimeHomeScore,
          regularTimeAwayScore: m.regularTimeAwayScore,
          fullTimeHomeScore: m.fullTimeHomeScore,
          fullTimeAwayScore: m.fullTimeAwayScore,
          extraTimeHomeScore: m.extraTimeHomeScore,
          extraTimeAwayScore: m.extraTimeAwayScore,
          penaltiesHomeScore: m.penaltiesHomeScore,
          penaltiesAwayScore: m.penaltiesAwayScore,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          winnerTeam: m.winnerTeam,
        },
      })

      // Track this match if its score changed (skip admin-overridden matches)
      const scoreChanged = !existing?.adminOverride && (
        existing === null
          ? m.homeScore !== null || m.awayScore !== null || m.winnerTeam !== null
          : existing.homeScore !== m.homeScore
            || existing.awayScore !== m.awayScore
            || existing.scoreDuration !== m.scoreDuration
            || existing.winnerTeam !== m.winnerTeam
            || existing.status !== m.status
      )
      if (scoreChanged) {
        changedMatchIds.add(upserted.id)
      }

      const h2hIsFresh = existing?.headToHeadSyncedAt && existing.headToHeadSyncedAt > staleH2HBefore
      const transitionedToFinished = existing?.status !== 'FINISHED' && m.status === 'FINISHED'
      if (!h2hIsFresh || transitionedToFinished) {
        try {
          const headToHead = await fetchHeadToHead(m.externalId, 10)
          await prisma.match.update({
            where: { externalId: m.externalId },
            data: {
              headToHeadHomeTeamId: headToHead.homeTeamId,
              headToHeadAwayTeamId: headToHead.awayTeamId,
              headToHeadJson: JSON.stringify(headToHead.matches),
              headToHeadSyncedAt: new Date(),
            },
          })
          h2hFetched++
        } catch (h2hErr) {
          console.warn(`[syncMatchesFromApi] H2H fetch failed for match ${m.externalId}:`, h2hErr)
        }
      }
      synced++

      // Rate-limit H2H calls: wait before the next iteration
      if (h2hFetched > 0 && synced < matches.length) {
        await sleep(h2hDelayMs)
      }
    }

    // Also sync teams
    try {
      const { fetchAllTeams } = await import('@/lib/football-api')
      const teams = await fetchAllTeams()
      for (const t of teams) {
        await prisma.team.upsert({
          where: { externalId: t.externalId },
          update: {
            name: t.name,
            shortName: t.shortName,
            tla: t.tla,
            crest: t.crest,
            areaName: t.areaName,
            areaCode: t.areaCode,
            address: t.address,
            website: t.website,
            founded: t.founded,
            clubColors: t.clubColors,
            venue: t.venue,
            coachName: t.coachName,
            squadJson: t.squadJson,
            staffJson: t.staffJson,
            runningCompetitionsJson: t.runningCompetitionsJson,
            rawJson: t.rawJson,
          },
          create: t,
        })
      }
    } catch {
      // Teams API may not be available — non-fatal
    }

    // Only recalculate predictions for matches whose scores actually changed
    const finishedChanged = await prisma.match.findMany({
      where: {
        id: { in: [...changedMatchIds] },
        status: 'FINISHED',
      },
    })
    for (const match of finishedChanged) await recalculateMatchPoints(match.id)

    revalidatePath('/admin')
    revalidatePath('/results')
    revalidatePath('/tournament')
    revalidatePath('/leaderboard')
    revalidatePath('/teams')
    await logAdminAction({
      adminId: session.userId!,
      adminUsername: session.username ?? String(session.userId),
      action: 'SYNC_MATCHES',
      details: `Synced ${synced} matches`,
    })
    return { success: true, synced }
  } catch (err) {
    return { error: String(err) }
  }
}
