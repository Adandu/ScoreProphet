'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { validatePredictionCombination, parseExactScore } from '@/lib/validation'

type PredictionType = 'SINGLE_OUTCOME' | 'DOUBLE_CHANCE' | 'EXACT_SCORE'

export async function savePrediction(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const type = formData.get('type') as PredictionType
  const value = (formData.get('value') as string)?.trim()

  if (!matchId || !type || !value) return { error: 'Missing fields' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }

  if (type === 'EXACT_SCORE') {
    const parsed = parseExactScore(value)
    if (!parsed) return { error: 'Invalid score format. Use e.g. 2-1' }
  }

  const existing = await prisma.prediction.findMany({
    where: { userId: session.userId, matchId },
  })

  const validationError = validatePredictionCombination(type, existing)
  if (validationError) return { error: validationError }

  await prisma.prediction.upsert({
    where: { userId_matchId_type: { userId: session.userId!, matchId, type } },
    update: { value },
    create: { userId: session.userId!, matchId, type, value },
  })

  revalidatePath('/predictions')
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
  revalidatePath('/predictions')
  return { success: true }
}

export async function saveKnockoutAdvance(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  const predictedTeam = (formData.get('predictedTeam') as string)?.trim()

  if (!matchId || !predictedTeam) return { error: 'Missing fields' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.stage === 'GROUP') return { error: 'Advance prediction only for knockout rounds' }
  if (match.kickoff <= new Date()) return { error: 'Predictions are locked for this match' }

  await prisma.knockoutAdvance.upsert({
    where: { userId_matchId: { userId: session.userId!, matchId } },
    update: { predictedTeam },
    create: { userId: session.userId!, matchId, predictedTeam },
  })

  revalidatePath('/predictions')
  return { success: true }
}

export async function resetMatchPredictions(prevState: unknown, formData: FormData) {
  const session = await requireAuth()
  const matchId = parseInt(formData.get('matchId') as string, 10)
  if (!matchId) return { error: 'Missing match ID' }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) return { error: 'Match not found' }
  if (match.kickoff <= new Date()) return { error: 'Match has already started — predictions are locked' }

  await prisma.prediction.deleteMany({ where: { userId: session.userId!, matchId } })
  await prisma.knockoutAdvance.deleteMany({ where: { userId: session.userId!, matchId } })

  revalidatePath('/predictions')
  return { success: true }
}
