import type { LiveTeam, LiveMatchEvent, LiveMatchBooking, LiveMatchSubstitution } from '@/lib/football-api'
import { computeFormationPositions, getTeamColor } from '@/lib/live-match'

interface Props {
  homeTeam: LiveTeam
  awayTeam: LiveTeam
  goals: LiveMatchEvent[]
  bookings: LiveMatchBooking[]
  substitutions: LiveMatchSubstitution[]
  referee: { name: string; nationality: string } | null
  homePossession: number | null
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * amount))},${Math.min(255, Math.round(g + (255 - g) * amount))},${Math.min(255, Math.round(b + (255 - b) * amount))})`
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`
}

function GradientDef({ id, hex }: { id: string; hex: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stopColor={lighten(hex, 0.5)} />
      <stop offset="45%" stopColor={hex} />
      <stop offset="100%" stopColor={darken(hex, 0.4)} />
    </linearGradient>
  )
}

function ShirtSvg({ gradientId }: { gradientId: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <path d="M2,17 L12,2 L17,9 L20,13 L23,9 L28,2 L38,17 L30,14 L30,37 L10,37 L10,14 Z" fill={`url(#${gradientId})`} filter="url(#shirt-shadow)" />
      <path d="M2,17 L12,2 L15,7 L10,14 Z" fill="rgba(255,255,255,0.22)" />
      <path d="M12,2 L17,9 L20,13 L23,9 L28,2 L20,6 Z" fill="rgba(255,255,255,0.1)" />
      <path d="M2,17 L12,2 L17,9 L20,13 L23,9 L28,2 L38,17 L30,14 L30,37 L10,37 L10,14 Z" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.7" />
    </svg>
  )
}

interface PlayerDotProps {
  name: string
  shirtNumber: number
  isGk: boolean
  gradientId: string
  left: number
  top: number
  goalCount: number
  yellowCards: number
  redCard: boolean
  subMinute: number | null
}

function PlayerDot({ name, shirtNumber, isGk, gradientId, left, top, goalCount, yellowCards, redCard, subMinute }: PlayerDotProps) {
  const displayName = [
    name,
    goalCount > 0 ? '⚽'.repeat(Math.min(goalCount, 3)) : '',
    yellowCards === 1 ? '🟨' : yellowCards >= 2 ? '🟥' : '',
    redCard ? '🟥' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transform: 'translate(-50%, -50%) translateZ(4px) rotateX(-20deg)',
        transformOrigin: 'center bottom',
        zIndex: 2,
        gap: '3px',
      }}
    >
      <div style={{ position: 'relative', width: 64, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ShirtSvg gradientId={isGk ? 'live-gk' : gradientId} />
        <span style={{ position: 'relative', zIndex: 2, fontSize: 15, fontWeight: 900, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,1)', marginTop: 12 }}>
          {shirtNumber}
        </span>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'center',
        whiteSpace: 'nowrap', maxWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis',
        background: 'rgba(0,0,0,0.72)', borderRadius: 4, padding: '2px 6px',
      }}>
        {displayName}
        {subMinute !== null && <span style={{ color: '#4ade80', marginLeft: 3, fontSize: 10 }}>↑{subMinute}&apos;</span>}
      </span>
    </div>
  )
}

export function PitchFormation({ homeTeam, awayTeam, goals, bookings, substitutions, referee, homePossession }: Props) {
  const homeColor = getTeamColor(homeTeam.name, homeTeam.id)
  const awayColor = getTeamColor(awayTeam.name, awayTeam.id)
  const homeGradId = `live-home-${homeTeam.id}`
  const awayGradId = `live-away-${awayTeam.id}`

  const homePositions = computeFormationPositions(homeTeam.formation, 'home')
  const awayPositions = computeFormationPositions(awayTeam.formation, 'away')

  // Build per-player event maps keyed by player name (lowercase)
  const goalsByPlayer = new Map<string, number>()
  for (const g of goals) {
    const key = g.playerName.toLowerCase()
    goalsByPlayer.set(key, (goalsByPlayer.get(key) ?? 0) + 1)
  }

  const yellowsByPlayer = new Map<string, number>()
  const redsByPlayer = new Set<string>()
  for (const b of bookings) {
    const key = b.playerName.toLowerCase()
    if (b.card === 'YELLOW_CARD') yellowsByPlayer.set(key, (yellowsByPlayer.get(key) ?? 0) + 1)
    if (b.card === 'RED_CARD' || b.card === 'YELLOW_RED_CARD') redsByPlayer.add(key)
  }

  const subOnMinutes = new Map<string, number>()
  for (const s of substitutions) {
    subOnMinutes.set(s.playerInName.toLowerCase(), s.minute)
  }

  const possession = homePossession ?? 50
  const awayPossession = 100 - possession

  const homeBenchSubbed = new Set(substitutions.filter(s => s.teamId === homeTeam.id).map(s => s.playerOutName.toLowerCase()))
  const awayBenchSubbed = new Set(substitutions.filter(s => s.teamId === awayTeam.id).map(s => s.playerOutName.toLowerCase()))

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Shared SVG defs */}
      <svg width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
        <defs>
          <GradientDef id={homeGradId} hex={homeColor} />
          <GradientDef id={awayGradId} hex={awayColor} />
          <linearGradient id="live-gk" x1="0" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="45%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
          <filter id="shirt-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>
      </svg>

      {/* Coach + Referee bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', background: '#071120', padding: '8px 12px', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Head Coach</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{homeTeam.coach ?? '—'}</div>
        </div>
        {referee && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Referee</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{referee.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{referee.nationality}</div>
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Head Coach</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#93bbff' }}>{awayTeam.coach ?? '—'}</div>
        </div>
      </div>

      {/* Formation bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', background: '#0a1628', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{homeTeam.formation || '—'}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>vs</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#93bbff', textAlign: 'right' }}>{awayTeam.formation || '—'}</div>
      </div>

      {/* Bench + Pitch + Bench row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* Home bench */}
        <div style={{ width: 108, flexShrink: 0, background: '#071120', display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 4, borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {homeTeam.name} bench
          </div>
          {homeTeam.bench.map((p) => {
            const subMin = subOnMinutes.get(p.name.toLowerCase())
            const wasSubbedOut = homeBenchSubbed.has(p.name.toLowerCase())
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: wasSubbedOut ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.73)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', width: 16, textAlign: 'right', flexShrink: 0 }}>{p.shirtNumber}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ').pop()}</span>
                {subMin !== undefined && (
                  <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, whiteSpace: 'nowrap' }}>↑{subMin}&apos;</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Pitch section */}
        <div style={{ flex: 1, minWidth: 0, background: '#071120' }}>
          <div style={{ perspective: 900, perspectiveOrigin: '50% 0%', padding: '10px 0 0' }}>
            <div style={{
              background: 'repeating-linear-gradient(0deg, #236f23 0px, #236f23 26px, #28832a 26px, #28832a 52px)',
              position: 'relative', width: '100%',
              aspectRatio: '105/68',
              overflow: 'visible',
              transform: 'rotateX(20deg)',
              transformOrigin: 'center bottom',
              transformStyle: 'preserve-3d',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 0 2px rgba(255,255,255,0.13)',
            }}>
              {/* Pitch markings */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)', transform: 'translateX(-50%)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: '18%', paddingTop: '18%', border: '2px solid rgba(255,255,255,0.35)', borderRadius: '50%', transform: 'translate(-50%,-50%)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 8, background: 'rgba(255,255,255,0.55)', borderRadius: '50%', transform: 'translate(-50%,-50%)' }} />
              <div style={{ position: 'absolute', left: 0, top: '22%', width: '11%', height: '56%', border: '2px solid rgba(255,255,255,0.25)', borderLeft: 'none' }} />
              <div style={{ position: 'absolute', right: 0, top: '22%', width: '11%', height: '56%', border: '2px solid rgba(255,255,255,0.25)', borderRight: 'none' }} />
              <div style={{ position: 'absolute', left: 0, top: '38%', width: '2.5%', height: '24%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)', borderLeft: 'none' }} />
              <div style={{ position: 'absolute', right: 0, top: '38%', width: '2.5%', height: '24%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)', borderRight: 'none' }} />
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.28)', pointerEvents: 'none' }} />

              {/* Home players */}
              {homeTeam.lineup.map((player, i) => {
                const pos = homePositions[i] ?? { left: 25, top: 50 }
                const key = player.name.toLowerCase()
                return (
                  <PlayerDot
                    key={player.id}
                    name={player.name.split(' ').pop() ?? player.name}
                    shirtNumber={player.shirtNumber}
                    isGk={player.position === 'Goalkeeper'}
                    gradientId={homeGradId}
                    left={pos.left}
                    top={pos.top}
                    goalCount={goalsByPlayer.get(key) ?? 0}
                    yellowCards={yellowsByPlayer.get(key) ?? 0}
                    redCard={redsByPlayer.has(key)}
                    subMinute={null}
                  />
                )
              })}

              {/* Away players */}
              {awayTeam.lineup.map((player, i) => {
                const pos = awayPositions[i] ?? { left: 75, top: 50 }
                const key = player.name.toLowerCase()
                return (
                  <PlayerDot
                    key={player.id}
                    name={player.name.split(' ').pop() ?? player.name}
                    shirtNumber={player.shirtNumber}
                    isGk={player.position === 'Goalkeeper'}
                    gradientId={awayGradId}
                    left={pos.left}
                    top={pos.top}
                    goalCount={goalsByPlayer.get(key) ?? 0}
                    yellowCards={yellowsByPlayer.get(key) ?? 0}
                    redCard={redsByPlayer.has(key)}
                    subMinute={null}
                  />
                )
              })}
            </div>
          </div>

          {/* Possession bar */}
          <div style={{ background: '#071120', padding: '10px 14px 14px', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontWeight: 800, color: '#4ade80', fontSize: 13 }}>{possession}%</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase' }}>Ball Possession</span>
              <span style={{ fontWeight: 800, color: '#93bbff', fontSize: 13 }}>{awayPossession}%</span>
            </div>
            <div style={{ height: 9, borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
              <div style={{ background: homeColor, width: `${possession}%` }} />
              <div style={{ background: awayColor, flex: 1 }} />
            </div>
          </div>
        </div>

        {/* Away bench */}
        <div style={{ width: 108, flexShrink: 0, background: '#071120', display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {awayTeam.name} bench
          </div>
          {awayTeam.bench.map((p) => {
            const subMin = subOnMinutes.get(p.name.toLowerCase())
            const wasSubbedOut = awayBenchSubbed.has(p.name.toLowerCase())
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: wasSubbedOut ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.73)', lineHeight: 1.5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', width: 16, textAlign: 'right', flexShrink: 0 }}>{p.shirtNumber}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ').pop()}</span>
                {subMin !== undefined && (
                  <span style={{ fontSize: 9, color: '#93bbff', fontWeight: 700, whiteSpace: 'nowrap' }}>↑{subMin}&apos;</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
