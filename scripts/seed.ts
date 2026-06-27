import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { fetchAllMatches, fetchAllTeams, fetchHeadToHead } from '../src/lib/football-api'

import { config } from 'dotenv'
config()

const dbUrl = (process.env.DATABASE_URL ?? 'file:./dev.db').replace(/^file:/, '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('[seed] Syncing WC2026 matches from football-data.org...')
  let matches
  try {
    matches = await fetchAllMatches()
  } catch (err) {
    console.warn('[seed] API unavailable, skipping match sync:', err)
    await prisma.$disconnect()
    return
  }
  for (const m of matches) {
    await prisma.match.upsert({
      where: { externalId: m.externalId },
      update: {
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
        tournamentId: 1,
      },
    })

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
    } catch (err) {
      console.warn(`[seed] Head-to-head sync failed for match ${m.externalId}:`, err)
    }
  }
  console.log(`[seed] Synced ${matches.length} matches.`)

  console.log('[seed] Syncing teams...')
  try {
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
    console.log(`[seed] Synced ${teams.length} teams.`)
  } catch (err) {
    console.warn('[seed] Team sync failed (API may not have teams yet):', err)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error('[seed] Fatal error:', e); process.exit(1) })
