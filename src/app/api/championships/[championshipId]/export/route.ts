import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ championshipId: string }> }
) {
  const session = await getSession()
  if (!session.userId) return new NextResponse('Unauthorized', { status: 401 })

  const { championshipId: rawId } = await params
  const championshipId = parseInt(rawId, 10)
  if (isNaN(championshipId)) return new NextResponse('Bad Request', { status: 400 })

  // Verify caller is a manager or admin
  const championship = await prisma.championship.findUnique({
    where: { id: championshipId },
    include: {
      managers: { select: { userId: true } },
      members: {
        select: {
          user: { select: { id: true, username: true } },
        },
      },
    },
  })

  if (!championship) return new NextResponse('Not Found', { status: 404 })

  const isManager = championship.managers.some((m) => m.userId === session.userId)
  const isAdmin = session.isAdmin
  if (!isManager && !isAdmin) return new NextResponse('Forbidden', { status: 403 })

  // Fetch all predictions for members of this championship
  const memberIds = championship.members.map((m) => m.user.id)

  const predictions = await prisma.prediction.findMany({
    where: {
      championshipId,
      userId: { in: memberIds },
    },
    include: {
      user: { select: { username: true } },
      match: {
        select: {
          stage: true,
          homeTeam: true,
          awayTeam: true,
          kickoff: true,
          homeScore: true,
          awayScore: true,
          status: true,
        },
      },
    },
    orderBy: [{ match: { kickoff: 'asc' } }, { user: { username: 'asc' } }],
  })

  // Build CSV
  const rows: string[] = []
  rows.push(
    ['Player', 'Stage', 'Home Team', 'Away Team', 'Kickoff', 'Prediction Type', 'Prediction', 'Home Score', 'Away Score', 'Points'].join(',')
  )

  for (const pred of predictions) {
    rows.push(
      [
        `"${pred.user.username}"`,
        `"${pred.match.stage ?? ''}"`,
        `"${pred.match.homeTeam ?? ''}"`,
        `"${pred.match.awayTeam ?? ''}"`,
        pred.match.kickoff ? new Date(pred.match.kickoff).toISOString() : '',
        pred.type,
        `"${pred.value}"`,
        pred.match.homeScore ?? '',
        pred.match.awayScore ?? '',
        pred.pointsAwarded ?? 0,
      ].join(',')
    )
  }

  const csv = rows.join('\n')
  const filename = `${championship.name.replace(/[^a-z0-9]/gi, '_')}_predictions.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
