// Thin runner — delegates all reminder logic to the shared library.
// Run with: node --import tsx/esm scripts/send-prediction-reminders.mjs
import { sendDuePredictionReminders } from '../src/lib/prediction-reminders.ts'

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function main() {
  const appUrl = getRequiredEnv('APP_URL')
  const { matchesChecked, sent } = await sendDuePredictionReminders(appUrl)
  console.log(`[prediction-reminders] Sent ${sent} reminders for ${matchesChecked} due matches.`)
}

main()
  .catch((err) => {
    console.error('[prediction-reminders] Fatal error:', err)
    process.exitCode = 1
  })
