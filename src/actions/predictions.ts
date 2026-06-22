'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import {
  getScoreOutcome,
  parseExactScore,
  validateExactScoreAgainstSelections,
  validatePredictionCombination,
  validateSelectionsAgainstExactScore,
} from '@/lib/validation'
import { VALID_PREDICTION_TYPES, type PredictionType } from '@/lib/types'

export async function savePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const typeValue = formData.get('type') as string
  let value = (formData.get('value') as string)?.trim()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!VALID_PREDICTION_TYPES.includes(typeValue as PredictionType)) return { error: 'Invalid prediction type' }
  const type = typeValue as PredictionType

  if (type === 'EXACT_SCORE' && !value) {
    const homeScore = parseInt(String(formData.get('homeScore') ?? ''), 10)
    const awayScore = parseInt(String(formData.get('awayScore') ?? ''), 10)
    if (Number.isInteger(homeScore) && Number.isInteger(awayScore)) value = `${homeScore}-${awayScore}`
  }

  if (!Number.isInteger(matchId) || matchId <= 0 || !type || !value || !Number.isInteger(championshipId) || championshipId <= 0) return { error: 'Missing fields' }

  const [match, membership] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
      include: { championship: true },
    }),
  ])

  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }
  if (!membership) return { error: 'You are not a member of this championship' }
  if (type === 'DOUBLE_CHANCE' && !membership.championship.doubleChanceEnabled) {
    return { error: 'Double chance is not enabled for this championship' }
  }

  if (type === 'EXACT_SCORE') {
    const parsed = parseExactScore(value)
    if (!parsed) return { error: 'Invalid score format. Choose scores from 0 to 10' }
  }

  const existing = await prisma.prediction.findMany({
    where: { userId: session.userId!, matchId, championshipId },
  })

  const existingOtherTypes = existing.filter((p) => p.type !== type)
  const validationError = validatePredictionCombination(type, existingOtherTypes)
  if (validationError) return { error: validationError }

  if (type === 'EXACT_SCORE') {
    const exactError = validateExactScoreAgainstSelections(parseExactScore(value)!, existingOtherTypes)
    if (exactError) return { error: exactError }
  } else {
    const selectionError = validateSelectionsAgainstExactScore({ type, value }, existingOtherTypes)
    if (selectionError) return { error: selectionError }
  }

  const operations = [
    prisma.prediction.upsert({
      where: { userId_matchId_type_championshipId: { userId: session.userId!, matchId, type, championshipId } },
      update: { value },
      create: { userId: session.userId!, matchId, type, value, championshipId },
    }),
  ]

  // Determine the effective result outcome after this save
  let effectiveOutcome: string | null = null
  if (type === 'SINGLE_OUTCOME') effectiveOutcome = value
  if (type === 'EXACT_SCORE' && !membership.championship.doubleChanceEnabled) {
    const parsed = parseExactScore(value)!
    effectiveOutcome = getScoreOutcome(parsed.home, parsed.away)
    operations.push(
      prisma.prediction.upsert({
        where: { userId_matchId_type_championshipId: { userId: session.userId!, matchId, type: 'SINGLE_OUTCOME', championshipId } },
        update: { value: effectiveOutcome },
        create: { userId: session.userId!, matchId, type: 'SINGLE_OUTCOME', value: effectiveOutcome, championshipId },
      })
    )
  }

  // Clear advance pick when result is confirmed non-draw
  if (effectiveOutcome !== null && effectiveOutcome !== 'X' && match.stage !== 'GROUP') {
    operations.push(
      prisma.knockoutAdvance.deleteMany({ where: { userId: session.userId!, matchId, championshipId } }) as never
    )
  }

  await prisma.$transaction(operations)

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function deletePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const predictionId = parseInt(formData.get('predictionId') as string, 10)

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { match: true },
  })
  if (!prediction || prediction.userId !== session.userId) return { error: 'Not found' }
  if (prediction.match.kickoff <= new Date()) return { error: 'Cannot delete after kickoff' }

  await prisma.prediction.delete({ where: { id: predictionId } })
  revalidatePath(`/championships/${prediction.championshipId}/predictions`)
  return { success: true }
}

export async function saveKnockoutAdvance(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !predictedTeam || !championshipId) return { error: 'Missing fields' }

  const [match, membership] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.championshipMember.findFirst({ where: { userId: session.userId!, championshipId } }),
  ])

  if (!match) return { error: 'Match not found' }
  if (match.stage === 'GROUP') return { error: 'Advance prediction only for knockout rounds' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }
  if (!isKnownTeam(match.homeTeam) || !isKnownTeam(match.awayTeam)) return { error: 'Advancing team prediction opens after both teams are decided' }
  if (!membership) return { error: 'You are not a member of this championship' }
  if (![match.homeTeam, match.awayTeam].includes(predictedTeam)) return { error: 'Choose one of the teams in this match' }

  await prisma.knockoutAdvance.upsert({
    where: { userId_matchId_championshipId: { userId: session.userId!, matchId, championshipId } },
    update: { predictedTeam },
    create: { userId: session.userId!, matchId, predictedTeam, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

function isKnownTeam(team: string): boolean {
  const normalized = team.trim().toUpperCase()
  return Boolean(normalized) && normalized !== 'TBD' && normalized !== 'TBA' && !normalized.includes('TO BE DETERMINED')
}

export async function resetMatchPredictions(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const championshipId = parseInt(formData.get('championshipId') as string, 10)

  if (!matchId || !championshipId) return { error: 'Missing fields' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Match has already started — predictions are locked' }

  await prisma.prediction.deleteMany({ where: { userId: session.userId!, matchId, championshipId } })
  await prisma.knockoutAdvance.deleteMany({ where: { userId: session.userId!, matchId, championshipId } })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function saveTournamentWinnerPrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()

  if (!Number.isInteger(championshipId) || championshipId <= 0 || !predictedTeam) {
    return { error: 'Missing fields' }
  }

  const [championship, membership] = await Promise.all([
    prisma.championship.findUnique({
      where: { id: championshipId },
      select: { competitionCode: true },
    }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
    }),
  ])

  if (!championship) return { error: 'Championship not found' }
  if (!membership) return { error: 'You are not a member of this championship' }

  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: 'GROUP', competitionCode: championship.competitionCode },
    orderBy: { kickoff: 'asc' },
    select: { kickoff: true },
  })

  if (firstGroupMatch && firstGroupMatch.kickoff <= new Date()) {
    return { error: 'Tournament winner prediction is locked' }
  }

  await prisma.tournamentWinnerPrediction.upsert({
    where: { userId_championshipId: { userId: session.userId!, championshipId } },
    update: { predictedTeam },
    create: { userId: session.userId!, championshipId, predictedTeam },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}

export async function resetTournamentWinnerPrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const championshipId = parseInt(formData.get('championshipId') as string, 10)
  if (!Number.isInteger(championshipId) || championshipId <= 0) return { error: 'Missing fields' }

  const [championship, membership] = await Promise.all([
    prisma.championship.findUnique({
      where: { id: championshipId },
      select: { competitionCode: true },
    }),
    prisma.championshipMember.findFirst({
      where: { userId: session.userId!, championshipId },
    }),
  ])

  if (!championship) return { error: 'Championship not found' }
  if (!membership) return { error: 'You are not a member of this championship' }

  const firstGroupMatch = await prisma.match.findFirst({
    where: { stage: 'GROUP', competitionCode: championship.competitionCode },
    orderBy: { kickoff: 'asc' },
    select: { kickoff: true },
  })
  if (firstGroupMatch && firstGroupMatch.kickoff <= new Date()) {
    return { error: 'Tournament winner prediction is locked' }
  }

  await prisma.tournamentWinnerPrediction.deleteMany({
    where: { userId: session.userId!, championshipId },
  })

  revalidatePath(`/championships/${championshipId}/predictions`)
  return { success: true }
}
