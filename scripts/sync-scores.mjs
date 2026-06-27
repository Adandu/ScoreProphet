// scripts/sync-scores.ts
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// src/lib/scoring.ts
var SCORING = {
  EXACT_SCORE: 5,
  SINGLE_OUTCOME: 3,
  DOUBLE_CHANCE: 1,
  ADVANCE: 1,
  TOURNAMENT_WINNER: 50
};
function getOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "1";
  if (homeScore === awayScore) return "X";
  return "2";
}
var DOUBLE_CHANCE_MAP = {
  "1X": ["1", "X"],
  "X2": ["X", "2"],
  "12": ["1", "2"]
};
function calculatePredictionPoints(type, value, homeScore, awayScore) {
  const outcome = getOutcome(homeScore, awayScore);
  switch (type) {
    case "SINGLE_OUTCOME":
      return value === outcome ? SCORING.SINGLE_OUTCOME : 0;
    case "DOUBLE_CHANCE": {
      const covers = DOUBLE_CHANCE_MAP[value] ?? [];
      return covers.includes(outcome) ? SCORING.DOUBLE_CHANCE : 0;
    }
    case "EXACT_SCORE": {
      const [predictedHome, predictedAway] = value.split("-").map(Number);
      return predictedHome === homeScore && predictedAway === awayScore ? SCORING.EXACT_SCORE : 0;
    }
    default:
      return 0;
  }
}
function calculateAdvancePoints(predictedTeam, actualWinner) {
  return predictedTeam === actualWinner ? SCORING.ADVANCE : 0;
}
var ADVANCE_SCORE_DURATIONS = ["EXTRA_TIME", "PENALTY_SHOOTOUT"];
function calculateAdvancePointsForMatch(predictedTeam, match) {
  if (!match.winnerTeam) return 0;
  if (!ADVANCE_SCORE_DURATIONS.includes(match.scoreDuration)) return 0;
  return calculateAdvancePoints(predictedTeam, match.winnerTeam);
}
function calculateTournamentWinnerPoints(predictedTeam, actualWinner) {
  return predictedTeam === actualWinner ? SCORING.TOURNAMENT_WINNER : 0;
}

// scripts/sync-scores.ts
var BASE_URL = "https://api.football-data.org/v4";
var dbUrl = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
var adapter = new PrismaBetterSqlite3({ url: dbUrl });
var prisma = new PrismaClient({ adapter });
var STATUS_MAP = {
  SCHEDULED: "SCHEDULED",
  TIMED: "SCHEDULED",
  IN_PLAY: "LIVE",
  PAUSED: "LIVE",
  FINISHED: "FINISHED",
  AWARDED: "FINISHED"
};
function getHeaders() {
  return { "X-Auth-Token": process.env.FOOTBALL_API_KEY ?? "" };
}
function scorePart(score, key, side) {
  const value = score?.[key]?.[side];
  return typeof value === "number" ? value : null;
}
function extractScores(apiScore) {
  const rh = scorePart(apiScore, "regularTime", "home");
  const ra = scorePart(apiScore, "regularTime", "away");
  const fh = scorePart(apiScore, "fullTime", "home");
  const fa = scorePart(apiScore, "fullTime", "away");
  return {
    regularTimeHomeScore: rh,
    regularTimeAwayScore: ra,
    fullTimeHomeScore: fh,
    fullTimeAwayScore: fa,
    extraTimeHomeScore: scorePart(apiScore, "extraTime", "home"),
    extraTimeAwayScore: scorePart(apiScore, "extraTime", "away"),
    penaltiesHomeScore: scorePart(apiScore, "penalties", "home"),
    penaltiesAwayScore: scorePart(apiScore, "penalties", "away"),
    scoreDuration: apiScore?.duration === "EXTRA_TIME" || apiScore?.duration === "PENALTY_SHOOTOUT" ? apiScore.duration : "REGULAR",
    homeScore: rh ?? fh,
    awayScore: ra ?? fa
  };
}
async function recalculateMatchPoints(match) {
  if (match.homeScore === null || match.awayScore === null) return;
  const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } });
  const ops = predictions.map(
    (p) => prisma.prediction.update({
      where: { id: p.id },
      data: { pointsAwarded: calculatePredictionPoints(p.type, p.value, match.homeScore, match.awayScore) }
    })
  );
  if (match.status === "FINISHED") {
    const advances = await prisma.knockoutAdvance.findMany({ where: { matchId: match.id } });
    for (const adv of advances) {
      const pts = calculateAdvancePointsForMatch(adv.predictedTeam, match);
      ops.push(prisma.knockoutAdvance.update({ where: { id: adv.id }, data: { pointsAwarded: pts } }));
    }
    if (match.stage === "FINAL" && match.winnerTeam) {
      const championships = await prisma.championship.findMany({
        where: { competitionCode: match.competitionCode },
        select: { id: true }
      });
      const championshipIds = championships.map((c) => c.id);
      const winnerPreds = await prisma.tournamentWinnerPrediction.findMany({
        where: { championshipId: { in: championshipIds } }
      });
      for (const wp of winnerPreds) {
        ops.push(prisma.tournamentWinnerPrediction.update({
          where: { id: wp.id },
          data: { pointsAwarded: calculateTournamentWinnerPoints(wp.predictedTeam, match.winnerTeam) }
        }));
      }
    }
  }
  if (ops.length > 0) await prisma.$transaction(ops);
}
async function main() {
  const activeTournaments = await prisma.tournament.findMany({
    where: { isActive: true, isArchived: false },
    select: { id: true, competitionCode: true, season: true }
  });
  if (activeTournaments.length === 0) {
    console.log("[score-sync] No active tournaments to sync.");
    return;
  }
  const activeTournamentIds = activeTournaments.map((t) => t.id);
  const now = /* @__PURE__ */ new Date();
  const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1e3);
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1e3);
  const [dbLiveMatches, nearKickoffCount] = await Promise.all([
    prisma.match.findMany({ where: { status: "LIVE", tournamentId: { in: activeTournamentIds } } }),
    prisma.match.count({ where: { kickoff: { gte: windowStart, lte: windowEnd }, status: "SCHEDULED", tournamentId: { in: activeTournamentIds } } })
  ]);
  if (dbLiveMatches.length === 0 && nearKickoffCount === 0) return;
  const apiLiveMatches = [];
  for (const tournament of activeTournaments) {
    const res = await fetch(`${BASE_URL}/competitions/${tournament.competitionCode}/matches?status=IN_PLAY,PAUSED${tournament.season ? `&season=${tournament.season}` : ""}`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.warn("[score-sync] Rate limited by API, skipping tournament", tournament.competitionCode);
        continue;
      }
      throw new Error(`[score-sync] API error ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    apiLiveMatches.push(...(data.matches ?? []));
  }
  const apiLiveIds = new Set(apiLiveMatches.map((m) => String(m.id)));
  let updated = 0;
  for (const m of apiLiveMatches) {
    const externalId = String(m.id);
    const existing = await prisma.match.findUnique({ where: { externalId } });
    if (!existing || existing.adminOverride) continue;
    const scores = extractScores(m.score);
    const status = STATUS_MAP[m.status] ?? "LIVE";
    const scoreChanged = existing.homeScore !== scores.homeScore || existing.awayScore !== scores.awayScore;
    const statusChanged = existing.status !== status;
    if (!scoreChanged && !statusChanged) continue;
    const updated_ = await prisma.match.update({
      where: { externalId },
      data: { status, ...scores }
    });
    if (scores.homeScore !== null && scores.awayScore !== null) {
      await recalculateMatchPoints(updated_);
      updated++;
      if (scoreChanged) {
        console.log(`[score-sync] ${existing.homeTeam} ${scores.homeScore}-${scores.awayScore} ${existing.awayTeam} (live)`);
      }
    }
  }
  const maybeFinished = dbLiveMatches.filter((m) => !apiLiveIds.has(m.externalId) && !m.adminOverride);
  for (const dbMatch of maybeFinished) {
    try {
      const r = await fetch(`${BASE_URL}/matches/${dbMatch.externalId}`, { headers: getHeaders() });
      if (!r.ok) {
        if (r.status === 429) {
          console.warn("[score-sync] Rate limited on individual match fetch");
          break;
        }
        continue;
      }
      const m = await r.json();
      const newStatus = STATUS_MAP[m.status] ?? "SCHEDULED";
      if (newStatus !== "FINISHED") continue;
      const scores = extractScores(m.score);
      const winner = m.score?.winner ?? null;
      const winnerTeam = winner === "HOME_TEAM" ? m.homeTeam?.name ?? null : winner === "AWAY_TEAM" ? m.awayTeam?.name ?? null : null;
      const finishedMatch = await prisma.match.update({
        where: { id: dbMatch.id },
        data: { status: "FINISHED", ...scores, winnerTeam }
      });
      await recalculateMatchPoints(finishedMatch);
      updated++;
      console.log(`[score-sync] ${dbMatch.homeTeam} ${finishedMatch.homeScore}-${finishedMatch.awayScore} ${dbMatch.awayTeam} FINISHED \u2014 points recalculated`);
    } catch (err) {
      console.warn(`[score-sync] Failed to check match ${dbMatch.externalId}:`, err instanceof Error ? err.message : err);
    }
  }
  if (updated > 0) console.log(`[score-sync] Recalculated points for ${updated} match(es)`);
  try {
    await prisma.jobStatus.upsert({
      where: { jobName: "score-sync" },
      update: { lastRunAt: /* @__PURE__ */ new Date(), lastResult: "ok", runCount: { increment: 1 } },
      create: { jobName: "score-sync", lastRunAt: /* @__PURE__ */ new Date(), lastResult: "ok", runCount: 1 }
    });
  } catch {
  }
}
main().catch(async (err) => {
  console.error("[score-sync] Fatal error:", err);
  try {
    await prisma.jobStatus.upsert({
      where: { jobName: "score-sync" },
      update: { lastRunAt: /* @__PURE__ */ new Date(), lastResult: String(err?.message ?? err), runCount: { increment: 1 } },
      create: { jobName: "score-sync", lastRunAt: /* @__PURE__ */ new Date(), lastResult: String(err?.message ?? err), runCount: 1 }
    });
  } catch {
  }
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
