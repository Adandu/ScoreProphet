# ScoreProphet

ScoreProphet is a private World Cup 2026 prediction app. Players predict match outcomes, exact scores, and knockout advancing teams; admins sync fixtures from football-data.org, enter or override results, and recalculate points.

Players compete inside managed championships. A user can belong to multiple championships, and one prediction set counts in every championship where that user is a member. Admins can also assign Championship Managers who manage specific championships without receiving full admin access.

## Stack

- Next.js App Router
- React 19
- Prisma 7 with SQLite and `better-sqlite3`
- `iron-session` cookie sessions
- Tailwind CSS
- Vitest

## Environment

Create `.env` from `.env.example` and set:

```bash
DATABASE_URL="file:./dev.db"
FOOTBALL_API_KEY="..."
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="at_least_6_chars"
SESSION_SECRET="at_least_32_characters_random_string"
APP_URL="http://localhost:3000"

# Email reminders (optional — feature is disabled if omitted)
SMTP_HOST="smtp.example.com"
SMTP_PORT="465"
SMTP_USER="noreply@example.com"
SMTP_PASSWORD="..."
SMTP_FROM="ScoreProphet <noreply@example.com>"
```

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are used only when registering the initial admin account. A matching username/password pair creates an admin user; later logins do not promote users based on the shared password.

`APP_URL` is used when generating absolute invitation and password-reset links. If omitted, ScoreProphet falls back to the current request host.

Email reminders notify users before kickoff for matches with incomplete predictions. Users enable reminders and set their preferred lead time (1–24 hours) in their profile. The feature is silently disabled when SMTP vars are absent.

## Local Development

```bash
npm install
DATABASE_URL="file:./dev.db" npx prisma migrate dev
DATABASE_URL="file:./dev.db" npm run sync
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Scoring

- Exact score: 5 points
- Match result (1/X/2): 3 points
- Double chance (1X/X2/12, if enabled): 1 point
- Correct knockout advancing team: 1 point (only available when predicting a draw; only awarded if the match goes to extra time or penalties)
- Tournament winner: 50 points (one-time; pick locks when the first group-stage match kicks off)

Maximum per match: 9 points for a perfect knockout prediction (3 + 5 + 1), 8 for group stage (no advancing-team pick).

Predictions lock at kickoff. Users may reset predictions for a match until kickoff.

Leaderboard tiebreaker order: most exact-score hits → most correct results → most correct advance picks → alphabetical username.

## Navigation

The top navigation shows: **Home | Championship Name | Tournament | How to Play | Username**. Clicking the championship name opens the championship hub (Predictions, Results, Leaderboard tabs). The username dropdown provides access to Profile, Manage (championship managers only), and Admin (admins only). A championship selector appears in the navbar when the user belongs to more than one championship.

Tournament has URL-persistent tabs: Group Stage, Knockout Bracket, Teams, Top Scorers, and Statistics. The championship hub tabs are also URL-persistent (F5-safe).

The championship hub is championship-scoped. Users without an active championship membership only see Home and Tournament.

## Key Features

**Live match center** — when a match is in play or starting within 15 minutes, a Live link appears in the navbar. The live page shows real-time lineups, formations, possession, match stats with jersey-colour bars, a goal/card/substitution timeline, and live scores synced every 10 seconds. Pre-match panels show expected lineups when available.

**Player profiles** — each championship member has a profile page showing their prediction history per match, points breakdown, and per-championship statistics. Profiles are accessible from the leaderboard.

**Badges and achievements** — players earn badges for notable performances (exact scores, streaks, specific milestones). Badges appear on the leaderboard with popovers showing the date and match they were earned.

**Per-stage leaderboards** — the leaderboard can be filtered by stage (group stage, knockout) in addition to the overall ranking.

**Head-to-head** — each match card on the home page shows a head-to-head section with all championship members' predictions once the match is live or finished.

**ProphetBot** — an AI bot user that submits predictions for all matches. Its predictions appear alongside human players on the results and leaderboard pages, marked with an AI badge.

**Team and player pages** — team detail pages show squad by position, WC match history, and form. Clicking a team name or crest anywhere in the app navigates to that team's page. Player names on the results page link to their profiles.

## Admin Flow

Admins can:

- Create and manage championships
- Assign users to championships
- Assign Championship Managers to specific championships
- Generate and revoke championship invitation links
- Sync fixtures and teams from football-data.org
- Override final scores
- Select the advancing team for knockout matches
- Recalculate all finished-match points
- Remove non-admin users
- View job status for background sync and point-recalculation tasks

Sync updates mutable fixture fields such as team names, crests, stage, group, kickoff, status, and scores.

## Championship Managers

Championship Managers are assigned by admins per championship. One user can manage multiple championships, and manager access does not grant global admin permissions.

Managers can open `Manage` in the navigation and, for each assigned championship:

- Add or remove championship members
- Generate invitation links for registered users
- Revoke active invitation links
- Enable or disable the championship
- Enable or disable Double Chance scoring

Managers only manage championships they are assigned to. They can participate in a championship only if they are also added as a member.

## Invitation Links

Generated invitation links open `/register?next=/invite/[token]`. A visitor must be signed in before accepting the invitation; the login and registration pages preserve the invite destination through the `next` query parameter. When accepted, the link adds the registered user to the linked championship and selects that championship for the session.

Invite tokens are stored hashed in the database. Invitation links are single-use: a successful acceptance deletes the invite. Active invitation links can also be revoked from the championship management page.

## Deployment

The Docker image runs Prisma migrations, attempts a fixture/team sync, then starts the standalone Next.js server.

```bash
docker compose up -d --build
```

The Compose file stores SQLite data in the `scoreprophet_data` volume at `/data/scoreprophet.db`.
