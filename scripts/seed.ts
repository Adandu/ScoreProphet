import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { fetchAllMatches, fetchAllTeams } from '../src/lib/football-api'

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
      update: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest },
      create: { externalId: m.externalId, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest, stage: m.stage, kickoff: m.kickoff, status: m.status, homeScore: m.homeScore, awayScore: m.awayScore },
    })
  }
  console.log(`[seed] Synced ${matches.length} matches.`)

  console.log('[seed] Syncing teams...')
  try {
    const teams = await fetchAllTeams()
    for (const t of teams) {
      await prisma.team.upsert({
        where: { externalId: t.externalId },
        update: { name: t.name, shortName: t.shortName, crest: t.crest },
        create: { externalId: t.externalId, name: t.name, shortName: t.shortName, crest: t.crest },
      })
    }
    console.log(`[seed] Synced ${teams.length} teams.`)
  } catch (err) {
    console.warn('[seed] Team sync failed (API may not have teams yet):', err)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error('[seed] Fatal error:', e); process.exit(1) })
