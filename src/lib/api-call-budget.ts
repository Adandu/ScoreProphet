// In-memory sliding-window rate limiter for finished match API calls.
// Module-level state persists across requests within the same Node.js process.

let callCount = 0
let windowStart = Date.now()

export function canCallMatchDetailApi(maxPerMinute = 5): boolean {
  const now = Date.now()
  if (now - windowStart > 60_000) {
    callCount = 0
    windowStart = now
  }
  if (callCount >= maxPerMinute) return false
  callCount++
  return true
}
