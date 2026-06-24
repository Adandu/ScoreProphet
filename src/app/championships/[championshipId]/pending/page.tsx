import { redirect } from 'next/navigation'

export default async function ChampionshipPendingPage({
  params,
}: {
  params: Promise<{ championshipId: string }>
}) {
  const { championshipId } = await params
  redirect(`/championships/${championshipId}/predictions?pending=1`)
}
