#!/usr/bin/env node
/**
 * Prophet Bot — AI-powered match predictor.
 * Runs on MasterChief (not in Docker). Uses the claude CLI (Claude Code subscription)
 * to generate predictions for matches kicking off within 60 minutes.
 * Writes directly to the SQLite DB via better-sqlite3.
 */

import Database from 'better-sqlite3'
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync } from 'fs'

const DB_PATH = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^file:/, '')
  : '/mnt/sdc/docker/scoreprophet/scoreprophet.db'

const BOT_USERNAME = 'ProphetBot'
const BOT_EMAIL = 'prophetbot@scoreprophet.internal'
// Bcrypt hash of a random password — bot never logs in
const BOT_PASSWORD_HASH = '$2b$10$prophetbotXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

if (!existsSync(DB_PATH)) {
  console.error(`[bot-predict] DB not found at ${DB_PATH}`)
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Ensure bot user exists ────────────────────────────────────────────────────

function ensureBotUser() {
  let bot = db.prepare('SELECT id FROM User WHERE username = ?').get(BOT_USERNAME)
  if (!bot) {
    const result = db.prepare(`
      INSERT INTO User (username, email, passwordHash, isBot, timezone, theme,
                        predictionReminderEnabled, createdAt)
      VALUES (?, ?, ?, 1, 'UTC', 'DARK', 0, datetime('now'))
    `).run(BOT_USERNAME, BOT_EMAIL, BOT_PASSWORD_HASH)
    bot = { id: result.lastInsertRowid }
    console.log(`[bot-predict] Created bot user id=${bot.id}`)
  }
  return bot.id
}

// ── Join bot to all championships it's not in ────────────────────────────────

function joinAllChampionships(botId) {
  const championships = db.prepare('SELECT id FROM Championship WHERE isActive = 1').all()
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO ChampionshipMember (championshipId, userId, createdAt)
    VALUES (?, ?, datetime('now'))
  `)
  for (const c of championships) {
    const result = insertMember.run(c.id, botId)
    if (result.changes > 0) console.log(`[bot-predict] Joined championship id=${c.id}`)
  }
  return championships.map((c) => c.id)
}

// ── Find matches to predict ───────────────────────────────────────────────────

function findMatchesToPredict(botId) {
  const now = Date.now()
  const cutoff = new Date(now + 60 * 60 * 1000).toISOString()
  const matches = db.prepare(`
    SELECT m.id, m.externalId, m.homeTeam, m.awayTeam, m.kickoff,
           m.stage, m."group", m.headToHeadJson, m.competitionCode
    FROM Match m
    JOIN Tournament t ON t.id = m.tournamentId
    WHERE m.status = 'SCHEDULED'
      AND m.kickoff <= ?
      AND m.kickoff > datetime('now')
      AND t.isActive = 1
      AND t.isArchived = 0
  `).all(cutoff)

  // Filter to matches where bot has no prediction yet
  return matches.filter((m) => {
    const existing = db.prepare(`
      SELECT 1 FROM Prediction WHERE userId = ? AND matchId = ? LIMIT 1
    `).get(botId, m.id)
    return !existing
  })
}

// ── Build match context for the prompt ───────────────────────────────────────

function buildContext(match) {
  // Head-to-head
  let h2hSummary = 'No previous head-to-head data available.'
  try {
    const h2h = JSON.parse(match.headToHeadJson ?? '[]')
    if (h2h.length > 0) {
      const lines = h2h.slice(0, 5).map(
        (r) => `${r.homeTeam} ${r.homeScore ?? '?'}-${r.awayScore ?? '?'} ${r.awayTeam}`
      )
      h2hSummary = `Last ${lines.length} meetings:\n${lines.join('\n')}`
    }
  } catch { /* ignore */ }

  // Form from finished matches
  const finished = db.prepare(`
    SELECT homeTeam, awayTeam, homeScore, awayScore, kickoff
    FROM Match
    WHERE status = 'FINISHED' AND homeScore IS NOT NULL
      AND (homeTeam = ? OR awayTeam = ? OR homeTeam = ? OR awayTeam = ?)
    ORDER BY kickoff DESC LIMIT 10
  `).all(match.homeTeam, match.homeTeam, match.awayTeam, match.awayTeam)

  const formByTeam = {}
  for (const m of [...finished].reverse()) {
    for (const [team, isHome] of [[m.homeTeam, true], [m.awayTeam, false]]) {
      if (team !== match.homeTeam && team !== match.awayTeam) continue
      const won = isHome ? m.homeScore > m.awayScore : m.awayScore > m.homeScore
      const drew = m.homeScore === m.awayScore
      formByTeam[team] = formByTeam[team] ?? []
      formByTeam[team].push(won ? 'W' : drew ? 'D' : 'L')
    }
  }

  const homeForm = (formByTeam[match.homeTeam] ?? []).slice(-5).join(' ') || 'No data'
  const awayForm = (formByTeam[match.awayTeam] ?? []).slice(-5).join(' ') || 'No data'

  // Tournament standings (group stage)
  const isGroup = match.stage === 'GROUP'
  let standingsSummary = ''
  if (isGroup && match.group) {
    const groupMatches = db.prepare(`
      SELECT homeTeam, awayTeam, homeScore, awayScore, status
      FROM Match
      WHERE "group" = ? AND status = 'FINISHED' AND homeScore IS NOT NULL
    `).all(match.group)
    const pts = {}
    for (const m of groupMatches) {
      pts[m.homeTeam] = pts[m.homeTeam] ?? 0
      pts[m.awayTeam] = pts[m.awayTeam] ?? 0
      if (m.homeScore > m.awayScore) pts[m.homeTeam] += 3
      else if (m.homeScore === m.awayScore) { pts[m.homeTeam] += 1; pts[m.awayTeam] += 1 }
      else pts[m.awayTeam] += 3
    }
    if (Object.keys(pts).length > 0) {
      const rows = Object.entries(pts).sort((a, b) => b[1] - a[1]).map(([t, p]) => `${t}: ${p} pts`)
      standingsSummary = `\nGroup ${match.group} standings:\n${rows.join('\n')}`
    }
  }

  return { homeForm, awayForm, h2hSummary, standingsSummary }
}

// ── Call Claude for predictions ───────────────────────────────────────────────

function askClaude(match, ctx, doubleChanceEnabled) {
  const doubleInstruction = doubleChanceEnabled
    ? '\n- "doubleChance": one of "1X", "X2", or "12" (pick the two outcomes you think are most likely)'
    : ''

  const isKnockout = match.stage !== 'GROUP'
  const advanceInstruction = isKnockout
    ? `\n- "advanceTeam": ONLY include this field if outcome is "X" (draw). Set it to "${match.homeTeam}" or "${match.awayTeam}" — the team you predict will advance after extra time / penalties.`
    : ''
  const advanceJsonField = isKnockout
    ? `\n  "advanceTeam": "${match.homeTeam}" or "${match.awayTeam}" (only when outcome is "X"),`
    : ''

  const prompt = `Analyse this World Cup 2026 match and predict the outcome for a prediction game.

HOME team: ${match.homeTeam}
AWAY team: ${match.awayTeam}
Stage: ${match.stage}${match.group ? ` (Group ${match.group})` : ''}
Kickoff: ${match.kickoff}

${match.homeTeam} (HOME) recent form (oldest→newest): ${ctx.homeForm}
${match.awayTeam} (AWAY) recent form (oldest→newest): ${ctx.awayForm}

Head-to-head:
${ctx.h2hSummary}
${ctx.standingsSummary}

Respond with valid JSON only. Rules:
- "outcome": "1" = ${match.homeTeam} wins, "X" = draw, "2" = ${match.awayTeam} wins
- "exactScore": "HOME_GOALS-AWAY_GOALS" (e.g. "2-1" means ${match.homeTeam} scores 2, ${match.awayTeam} scores 1). The outcome MUST match the exactScore (if ${match.awayTeam} wins, away goals must be higher).${doubleInstruction}${advanceInstruction}
- "reasoning": 1-2 sentence explanation

{
  "outcome": "1" or "X" or "2",
  "exactScore": "HOME_GOALS-AWAY_GOALS",${doubleInstruction}${advanceJsonField}
  "reasoning": "..."
}`

  try {
    const result = spawnSync('/root/.local/bin/claude', ['-p', prompt, '--output-format', 'text'], {
      timeout: 30000,
      encoding: 'utf8',
    })
    if (result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || `non-zero exit (${result.status})`)
    // Strip markdown code fences if Claude wraps the JSON
    const raw = (result.stdout ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])

    // Validate outcome is consistent with exactScore
    const scoreParts = (parsed.exactScore ?? '').split('-').map(Number)
    if (scoreParts.length === 2 && !isNaN(scoreParts[0]) && !isNaN(scoreParts[1])) {
      const [h, a] = scoreParts
      const impliedOutcome = h > a ? '1' : h < a ? '2' : 'X'
      if (impliedOutcome !== parsed.outcome) {
        console.error(`[bot-predict] Inconsistent prediction for ${match.homeTeam} vs ${match.awayTeam}: outcome=${parsed.outcome} but exactScore=${parsed.exactScore} implies ${impliedOutcome}. Discarding.`)
        return null
      }
    }

    return parsed
  } catch (err) {
    console.error(`[bot-predict] Claude call failed for ${match.homeTeam} vs ${match.awayTeam}: ${err.message}`)
    return null
  }
}

// ── Persist predictions for all championships ─────────────────────────────────

function savePredictions(botId, match, prediction, championshipIds) {
  const insertPrediction = db.prepare(`
    INSERT OR IGNORE INTO Prediction (userId, matchId, championshipId, type, value, reasoning, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `)
  const insertAdvance = db.prepare(`
    INSERT OR IGNORE INTO KnockoutAdvance (userId, matchId, championshipId, predictedTeam)
    VALUES (?, ?, ?, ?)
  `)

  const isKnockout = match.stage !== 'GROUP'
  const save = db.transaction((champIds) => {
    for (const champId of champIds) {
      const champ = db.prepare('SELECT doubleChanceEnabled FROM Championship WHERE id = ?').get(champId)

      insertPrediction.run(botId, match.id, champId, 'SINGLE_OUTCOME', prediction.outcome, prediction.reasoning ?? '')
      insertPrediction.run(botId, match.id, champId, 'EXACT_SCORE', prediction.exactScore, '')

      if (champ?.doubleChanceEnabled && prediction.doubleChance) {
        insertPrediction.run(botId, match.id, champId, 'DOUBLE_CHANCE', prediction.doubleChance, '')
      }

      if (isKnockout && prediction.outcome === 'X' && prediction.advanceTeam) {
        insertAdvance.run(botId, match.id, champId, prediction.advanceTeam)
      }
    }
  })
  save(championshipIds)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const botId = ensureBotUser()
  const championshipIds = joinAllChampionships(botId)
  if (championshipIds.length === 0) {
    console.log('[bot-predict] No active championships.')
    return
  }

  const matches = findMatchesToPredict(botId)
  if (matches.length === 0) {
    console.log('[bot-predict] No matches to predict right now.')
    return
  }

  // Check if at least one championship has doubleChance enabled (for prompt)
  const anyDoubleChance = db.prepare(
    `SELECT 1 FROM Championship WHERE id IN (${championshipIds.map(() => '?').join(',')}) AND doubleChanceEnabled = 1 LIMIT 1`
  ).get(...championshipIds)

  for (const match of matches) {
    console.log(`[bot-predict] Predicting ${match.homeTeam} vs ${match.awayTeam}...`)
    const ctx = buildContext(match)
    const prediction = askClaude(match, ctx, Boolean(anyDoubleChance))
    if (!prediction) continue

    savePredictions(botId, match, prediction, championshipIds)
    const advanceLog = prediction.outcome === 'X' && prediction.advanceTeam ? ` → ${prediction.advanceTeam} to advance` : ''
    console.log(`[bot-predict] ✓ ${match.homeTeam} vs ${match.awayTeam}: ${prediction.outcome} / ${prediction.exactScore}${advanceLog}`)
  }
}

main().catch((err) => {
  console.error('[bot-predict] Fatal:', err)
  process.exitCode = 1
}).finally(() => db.close())
