import { redirectToSelectedChampionshipPage } from '@/lib/championships'

export default async function LeaderboardPage() {
  await redirectToSelectedChampionshipPage('leaderboard')
}
