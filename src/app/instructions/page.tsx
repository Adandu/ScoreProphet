import type { ReactNode } from 'react'
import { requireAuth } from '@/lib/auth'

export default async function InstructionsPage() {
  await requireAuth()

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">How to Play</h1>
        <p className="text-white/55">
          ScoreProphet lets you predict match outcomes and compete on a leaderboard within your championship group.
          All predictions are scoped to the championship selected in the navbar.
        </p>
      </header>

      {/* Scoring */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Scoring</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ScoreCard title="Match result" points="3 pts" icon="🏆">
            Pick the regular-time outcome: home win (<strong>1</strong>), draw (<strong>X</strong>), or away win (<strong>2</strong>).
            Awarded if your pick matches the 90-minute result.
          </ScoreCard>
          <ScoreCard title="Exact score" points="5 pts" icon="🎯">
            Predict the exact scoreline after 90 minutes. If a knockout match goes to extra time or
            penalties, exact score is still judged on the regular-time result — not the final score on the board.
          </ScoreCard>
          <ScoreCard title="Double chance" points="1 pt" icon="🔀">
            Available only when the championship has double chance enabled. Choose two outcomes instead
            of one: <strong>1X</strong> (home or draw), <strong>X2</strong> (draw or away), or <strong>12</strong> (home or away).
            A lower-risk pick that earns fewer points.
          </ScoreCard>
          <ScoreCard title="Advancing team" points="1 pt" icon="➡️">
            Knockout rounds only. Once both teams in a tie are confirmed, predict which team will advance
            if the match reaches extra time or penalties. Earns 1 point only when the match actually goes
            beyond 90 minutes — ignored and worth 0 if the match is settled in regular time.
          </ScoreCard>
          <ScoreCard title="Tournament winner" points="50 pts" icon="🏅">
            Pick the team you think will win the entire tournament. This prediction is made once per
            championship on the predictions page and locks the moment the first group-stage match kicks off.
            If your pick lifts the trophy, you earn a one-time bonus of 50 points.
          </ScoreCard>
        </div>

        <div className="rounded-lg border border-[#C9A84C]/20 bg-[#C9A84C]/5 px-5 py-4 text-sm text-white/70">
          <span className="font-semibold text-[#F2D27A]">Maximum per match: </span>
          A perfect knockout prediction earns up to <span className="font-semibold text-white">9 points</span> — 3 (result) + 5 (exact score) + 1 (advancing team).
          Group-stage matches max out at <span className="font-semibold text-white">8 points</span> (no advancing-team pick).
        </div>
      </section>

      {/* Prediction rules */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Prediction Rules</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Rule title="Lock at kickoff">
            All predictions for a match — result, exact score, double chance, and advancing team — lock
            the moment the match kicks off. You can edit or delete predictions freely up until that point.
          </Rule>
          <Rule title="Predictions revealed">
            Once a match kicks off (or goes live), every championship member&apos;s predictions for that match
            become visible on the home page. Predictions for future matches remain hidden until their respective kickoffs.
          </Rule>
          <Rule title="Group stage">
            Group-stage matches support result, exact score, and (if enabled) double chance predictions.
            There is no advancing-team pick in the group stage.
          </Rule>
          <Rule title="Knockout stage">
            Knockout matches add the advancing-team pick on top of the standard predictions. Both teams
            in the tie must be confirmed before this option appears on the predictions page.
          </Rule>
          <Rule title="Score used for points">
            Points are always calculated on the 90-minute (regular-time) score. The tournament bracket
            and results page display the official final score including any extra time and penalty shootout.
          </Rule>
          <Rule title="Missing predictions">
            Predictions you haven&apos;t submitted score 0 for that category. You don&apos;t need to fill every
            field, but you&apos;ll miss out on points for anything left blank.
          </Rule>
        </div>
      </section>

      {/* Leaderboard & standings */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Leaderboard &amp; Standings</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Rule title="Points update">
            Leaderboard points update after an admin syncs results from the API or enters them manually.
            There may be a short delay between a match ending and points appearing.
          </Rule>
          <Rule title="Group standings tiebreaker">
            When teams are tied on points in the World Cup group standings, the app applies the FIFA
            head-to-head tiebreaker: H2H points → H2H goal difference → H2H goals scored → overall
            goal difference → overall goals scored.
          </Rule>
          <Rule title="Third-place advancement">
            The best eight third-placed teams across all groups advance to the Round of 32.
            The standings table marks advancing teams once all group matches are complete.
          </Rule>
          <Rule title="Championship leaderboard">
            The leaderboard ranks all members of your selected championship by total points accumulated
            across all finished matches. It is specific to each championship — members of different
            championships do not compete against each other.
          </Rule>
          <Rule title="Leaderboard tiebreaker">
            When two or more players share the same total points, the ranking is decided in order by:
            most exact-score hits → most correct results → most correct advance picks → alphabetical username.
          </Rule>
        </div>
      </section>

      {/* Championships */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Championships</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Rule title="Joining">
            Championships are invite-only. Ask your championship admin for an invite link. Links expire after
            7 days — request a new one if yours has lapsed.
          </Rule>
          <Rule title="Switching championships">
            Use the championship selector in the navbar to switch between championships you belong to.
            Predictions, leaderboard, and revealed predictions all update to reflect the selected championship.
          </Rule>
          <Rule title="Multiple championships">
            You can be a member of multiple championships simultaneously. Predictions are independent
            per championship — submitting a prediction in one does not affect another.
          </Rule>
          <Rule title="Championship settings">
            Each championship can independently enable or disable double chance predictions. The admin
            can also set whether the championship is active and manage members.
          </Rule>
        </div>
      </section>

      {/* Live & reminders */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Live Matches &amp; Reminders</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Rule title="Live match center">
            When a match is in play, a <strong>Match center</strong> button appears on the home page card.
            The live page shows real-time lineups, goals, cards, and substitutions for all concurrent live matches.
          </Rule>
          <Rule title="Email reminders">
            Enable prediction reminders in your profile settings. You&apos;ll receive an email before kickoff
            for any match where your predictions are incomplete. The lead time (1–24 hours) is configurable in your profile.
          </Rule>
          <Rule title="Reminder conditions">
            A reminder is sent only once per match per championship. If you complete your predictions after
            receiving a reminder, no further email is sent for that match.
          </Rule>
          <Rule title="Timezone">
            Match times on reminders and throughout the app are shown in your profile timezone. Update it
            in profile settings if kickoff times look wrong.
          </Rule>
        </div>
      </section>
    </div>
  )
}

function ScoreCard({ title, points, icon, children }: { title: string; points: string; icon: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{icon}</span>
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <span className="shrink-0 rounded bg-[#C9A84C]/15 px-2 py-1 text-xs font-semibold text-[#F2D27A]">{points}</span>
      </div>
      <p className="text-sm leading-6 text-white/60">{children}</p>
    </div>
  )
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <h3 className="mb-2 font-semibold text-white">{title}</h3>
      <p className="text-sm leading-6 text-white/60">{children}</p>
    </div>
  )
}
