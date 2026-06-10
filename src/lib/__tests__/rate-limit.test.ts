import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, RateLimitStore, extractClientIp } from '../rate-limit'

describe('extractClientIp', () => {
  it('uses the single forwarded IP when there is one hop', () => {
    expect(extractClientIp('1.2.3.4', null)).toBe('1.2.3.4')
  })

  it('uses the LAST forwarded IP (trusted-proxy hop), ignoring client-spoofed leading entries', () => {
    expect(extractClientIp('9.9.9.9, 8.8.8.8, 1.2.3.4', null)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when no forwarded header is present', () => {
    expect(extractClientIp(null, '5.6.7.8')).toBe('5.6.7.8')
  })

  it('returns "unknown" when no client headers are present', () => {
    expect(extractClientIp(null, null)).toBe('unknown')
  })
})

describe('RateLimitStore.prune', () => {
  it('removes entries whose window has expired', () => {
    const store = new RateLimitStore()
    checkRateLimit(store, 'stale', 5, 60_000)
    checkRateLimit(store, 'fresh', 5, 60_000)
    const map = (store as unknown as { map: Map<string, { count: number; resetAt: number }> }).map
    map.get('stale')!.resetAt = Date.now() - 1
    store.prune(Date.now())
    expect(map.has('stale')).toBe(false)
    expect(map.has('fresh')).toBe(true)
  })
})

describe('checkRateLimit', () => {
  let store: RateLimitStore

  beforeEach(() => {
    store = new RateLimitStore()
  })

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(store, 'key', 5, 60_000)).toBe(true)
    }
  })

  it('blocks the request that exceeds the limit', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, 'key', 5, 60_000)
    expect(checkRateLimit(store, 'key', 5, 60_000)).toBe(false)
  })

  it('resets after the window expires', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, 'key', 5, 60_000)
    // Simulate window expiry by manipulating the entry
    const entry = (store as unknown as { map: Map<string, { count: number; resetAt: number }> }).map.get('key')!
    entry.resetAt = Date.now() - 1  // expired
    expect(checkRateLimit(store, 'key', 5, 60_000)).toBe(true)
  })

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++) checkRateLimit(store, 'ip-a', 5, 60_000)
    expect(checkRateLimit(store, 'ip-b', 5, 60_000)).toBe(true)
  })
})
