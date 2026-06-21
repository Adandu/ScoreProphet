// scripts/send-prediction-reminders.ts
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// src/lib/email.ts
import nodemailer from "nodemailer";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join } from "path";
var trophyDataUri = (() => {
  try {
    const buf = readFileSync(join(process.cwd(), "public/World_Cup_Trophy_email.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();
var crestCache = /* @__PURE__ */ new Map();
var ALLOWED_CREST_HOSTS = /* @__PURE__ */ new Set([
  "crests.football-data.org",
  "media.api-sports.io",
  "upload.wikimedia.org",
  "flags.fmcdn.net"
]);
var MAX_CREST_BYTES = 512 * 1024;
async function crestToDataUri(url) {
  if (!url || !url.startsWith("https://")) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!ALLOWED_CREST_HOSTS.has(parsed.hostname)) return null;
  if (crestCache.has(url)) return crestCache.get(url);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return null;
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_CREST_BYTES) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("svg") || url.toLowerCase().endsWith(".svg")) {
      const svg = await res.text();
      if (svg.length > MAX_CREST_BYTES) return null;
      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 56 } });
      const png = resvg.render().asPng();
      const uri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
      if (crestCache.size < 500) crestCache.set(url, uri);
      return uri;
    }
    if (contentType.includes("png") || contentType.includes("jpeg")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_CREST_BYTES) return null;
      const mime = contentType.includes("jpeg") ? "image/jpeg" : "image/png";
      const uri = `data:${mime};base64,${buf.toString("base64")}`;
      if (crestCache.size < 500) crestCache.set(url, uri);
      return uri;
    }
  } catch {
  }
  return null;
}
function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
function createTransporter() {
  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = getRequiredEnv("SMTP_USER");
  const pass = getRequiredEnv("SMTP_PASSWORD");
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass }
  });
}
function getFromAddress() {
  return process.env.SMTP_FROM ?? getRequiredEnv("SMTP_USER");
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function crestImg(dataUri, teamName) {
  if (!dataUri) return "";
  return `<img src="${dataUri}" width="48" height="48" alt="${escapeHtml(teamName)}" style="display:block;margin:0 auto 10px;max-width:48px;height:48px;object-fit:contain;">`;
}
function buildReminderHtml(match, predictionsUrl, homeCrest, awayCrest) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>ScoreProphet Reminder</title></head>
<body style="margin:0;padding:0;background-color:#0A1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0A1628;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        ${trophyDataUri ? `<tr>
          <td align="center" style="padding-bottom:8px;">
            <img src="${trophyDataUri}" width="80" height="80" alt="ScoreProphet" style="display:block;margin:0 auto;width:80px;height:80px;object-fit:contain;">
          </td>
        </tr>` : ""}
        <tr>
          <td align="center" style="padding-bottom:8px;">
            <span style="font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:0.06em;">ScoreProphet</span>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">Prediction reminder</p>
          </td>
        </tr>

        <tr>
          <td style="background-color:#111c2e;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px 28px;">

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td align="center">
                  <span style="display:inline-block;background-color:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;color:#F2D27A;letter-spacing:0.03em;">${escapeHtml(match.stageLabel)}</span>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
              <tr>
                <td width="44%" align="center" style="vertical-align:middle;padding:12px 0;">
                  ${crestImg(homeCrest, match.homeTeam)}
                  <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;text-align:center;">${escapeHtml(match.homeTeam)}</p>
                </td>
                <td width="12%" align="center" style="vertical-align:middle;">
                  <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.25);letter-spacing:0.15em;text-transform:uppercase;">vs</span>
                </td>
                <td width="44%" align="center" style="vertical-align:middle;padding:12px 0;">
                  ${crestImg(awayCrest, match.awayTeam)}
                  <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;text-align:center;">${escapeHtml(match.awayTeam)}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td align="center" style="padding:12px 0 4px;">
                  <span style="display:inline-block;background-color:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.35);border-radius:6px;padding:8px 18px;font-size:14px;font-weight:600;color:#F2D27A;">&#128197; ${escapeHtml(match.kickoffLabel)}</span>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr><td style="border-top:1px solid rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td style="font-size:12px;color:rgba(255,255,255,0.4);">Competition</td>
                <td align="right" style="font-size:13px;color:rgba(255,255,255,0.85);font-weight:500;">${escapeHtml(match.championshipName)}</td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <a href="${escapeHtml(predictionsUrl)}" style="display:inline-block;background-color:#C9A84C;color:#0A1628;font-size:14px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.02em;">Set my predictions</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;">
              You're receiving this because prediction reminders are enabled on your account.<br>
              You can disable them in your profile settings.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
async function sendPredictionReminderEmail(to, match, predictionsUrl) {
  const transporter = createTransporter();
  const teams = `${match.homeTeam} vs ${match.awayTeam}`;
  const subject = `ScoreProphet reminder: set your prediction for ${teams}`;
  const text = [
    "Your ScoreProphet predictions are not set for this upcoming match.",
    "",
    `Match: ${teams}`,
    `Competition: ${match.championshipName}`,
    `Stage: ${match.stageLabel}`,
    `Kickoff: ${match.kickoffLabel}`,
    "",
    `Set your predictions here: ${predictionsUrl}`
  ].join("\n");
  const [homeCrest, awayCrest] = await Promise.all([
    crestToDataUri(match.homeTeamCrest),
    crestToDataUri(match.awayTeamCrest)
  ]);
  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html: buildReminderHtml(match, predictionsUrl, homeCrest, awayCrest)
  });
}

// scripts/send-prediction-reminders.ts
var MAX_REMINDER_LEAD_MS = 24 * 60 * 60 * 1e3;
var FALLBACK_TZ = "Europe/Bucharest";
var STAGE_LABELS = {
  GROUP: "Group Stage",
  ROUND_OF_32: "Round of 32",
  ROUND_OF_16: "Round of 16",
  QUARTER_FINAL: "Quarter-Finals",
  SEMI_FINAL: "Semi-Finals",
  THIRD_PLACE: "Third Place",
  FINAL: "Final"
};
var dbUrl = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
var adapter = new PrismaBetterSqlite3({ url: dbUrl });
var prisma = new PrismaClient({ adapter });
function getRequiredEnv2(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
function formatMatchTime(date, timezone = FALLBACK_TZ) {
  const options = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone
  };
  try {
    return new Intl.DateTimeFormat("en-GB", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: FALLBACK_TZ }).format(date);
  }
}
function arePredictionsConfigured(match, predictions, hasAdvancePrediction, doubleChanceEnabled) {
  const visible = doubleChanceEnabled ? predictions : predictions.filter((p) => p.type !== "DOUBLE_CHANCE");
  const hasResult = visible.some((p) => p.type === "SINGLE_OUTCOME" || p.type === "DOUBLE_CHANCE");
  const hasExact = visible.some((p) => p.type === "EXACT_SCORE");
  const hasAdvance = match.stage === "GROUP" || hasAdvancePrediction;
  return hasResult && hasExact && hasAdvance;
}
async function main() {
  const appUrl = getRequiredEnv2("APP_URL").replace(/\/$/, "");
  const now = /* @__PURE__ */ new Date();
  const dueBefore = new Date(now.getTime() + MAX_REMINDER_LEAD_MS);
  const matches = await prisma.match.findMany({
    where: { status: "SCHEDULED", kickoff: { gt: now, lte: dueBefore } },
    orderBy: { kickoff: "asc" }
  });
  if (matches.length === 0) {
    console.log("[prediction-reminders] No matches due within reminder window.");
    return;
  }
  const championships = await prisma.championship.findMany({
    where: { isActive: true },
    select: { id: true, name: true, doubleChanceEnabled: true }
  });
  let sent = 0;
  for (const championship of championships) {
    const matchIds = matches.map((m) => m.id);
    const [members, sentReminders, allPredictions, allAdvances] = await Promise.all([
      prisma.championshipMember.findMany({
        where: {
          championshipId: championship.id,
          user: { predictionReminderEnabled: true, email: { not: null } }
        },
        include: { user: { select: { id: true, email: true, timezone: true, predictionReminderHoursBefore: true } } }
      }),
      prisma.predictionReminder.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds } },
        select: { userId: true, matchId: true }
      }),
      prisma.prediction.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds } },
        select: { userId: true, matchId: true, type: true }
      }),
      prisma.knockoutAdvance.findMany({
        where: { championshipId: championship.id, matchId: { in: matchIds } },
        select: { userId: true, matchId: true }
      })
    ]);
    if (members.length === 0) continue;
    const reminderSet = new Set(sentReminders.map((r) => `${r.userId}:${r.matchId}`));
    const predictionsByKey = /* @__PURE__ */ new Map();
    for (const p of allPredictions) {
      const key = `${p.userId}:${p.matchId}`;
      const list = predictionsByKey.get(key) ?? [];
      list.push(p);
      predictionsByKey.set(key, list);
    }
    const advanceSet = new Set(allAdvances.map((a) => `${a.userId}:${a.matchId}`));
    for (const match of matches) {
      for (const member of members) {
        if (!member.user.email) continue;
        const userLeadMs = (member.user.predictionReminderHoursBefore ?? 12) * 60 * 60 * 1e3;
        if (match.kickoff.getTime() - now.getTime() > userLeadMs) continue;
        const key = `${member.user.id}:${match.id}`;
        if (reminderSet.has(key)) continue;
        const predictions = predictionsByKey.get(key) ?? [];
        const hasAdvance = advanceSet.has(key);
        if (arePredictionsConfigured(match, predictions, hasAdvance, championship.doubleChanceEnabled)) continue;
        await sendPredictionReminderEmail(
          member.user.email,
          {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeTeamCrest: match.homeTeamCrest ?? void 0,
            awayTeamCrest: match.awayTeamCrest ?? void 0,
            kickoffLabel: formatMatchTime(match.kickoff, member.user.timezone ?? void 0),
            stageLabel: STAGE_LABELS[match.stage] ?? match.stage,
            championshipName: championship.name
          },
          `${appUrl}/championships/${championship.id}/predictions`
        );
        await prisma.predictionReminder.create({
          data: { userId: member.user.id, matchId: match.id, championshipId: championship.id }
        });
        reminderSet.add(key);
        sent++;
      }
    }
  }
  console.log(`[prediction-reminders] Sent ${sent} reminders for ${matches.length} due matches.`);
  try {
    await prisma.jobStatus.upsert({
      where: { jobName: "prediction-reminders" },
      update: { lastRunAt: /* @__PURE__ */ new Date(), lastResult: "ok", runCount: { increment: 1 } },
      create: { jobName: "prediction-reminders", lastRunAt: /* @__PURE__ */ new Date(), lastResult: "ok", runCount: 1 }
    });
  } catch {
  }
}
main().catch(async (err) => {
  console.error("[prediction-reminders] Fatal error:", err);
  try {
    await prisma.jobStatus.upsert({
      where: { jobName: "prediction-reminders" },
      update: { lastRunAt: /* @__PURE__ */ new Date(), lastResult: String(err?.message ?? err), runCount: { increment: 1 } },
      create: { jobName: "prediction-reminders", lastRunAt: /* @__PURE__ */ new Date(), lastResult: String(err?.message ?? err), runCount: 1 }
    });
  } catch {
  }
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
