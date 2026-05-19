'use client'

import { useState, useRef, useEffect, useActionState } from 'react'
import Image from 'next/image'
import { saveTournamentWinnerPrediction, resetTournamentWinnerPrediction } from '@/actions/predictions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

interface Team {
  name: string
  shortName: string
  crest: string
}

interface Props {
  teams: Team[]
  existing: string | null
  championshipId: number
  locked: boolean
}

export function TournamentWinnerSelector({ teams, existing, championshipId, locked }: Props) {
  const [saveState, saveAction, savePending] = useActionState(saveTournamentWinnerPrediction, null)
  const [resetState, resetAction, resetPending] = useActionState(resetTournamentWinnerPrediction, null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(existing)
  const [isEditing, setIsEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (saveState?.success) setIsEditing(false)
  }, [saveState])

  useEffect(() => {
    if (resetState?.success) {
      setSelected(null)
      setIsEditing(false)
    }
  }, [resetState])

  const filtered = search.trim()
    ? teams.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.shortName.toLowerCase().includes(search.toLowerCase()),
      )
    : teams

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function openDropdown() {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function pickTeam(name: string) {
    setSelected(name)
    setOpen(false)
    setSearch('')
  }

  const selectedTeam = selected ? teams.find((t) => t.name === selected) : null

  if (locked) {
    const existingTeam = existing ? teams.find((t) => t.name === existing) : null
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex-1">
          {existing ? (
            <div className="flex items-center gap-3">
              {existingTeam?.crest && (
                <Image src={existingTeam.crest} alt="" width={28} height={28} className="max-h-7 w-auto object-contain" />
              )}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#C9A84C] mb-0.5">Your pick</div>
                <span className="text-sm font-bold text-white">{existing}</span>
              </div>
            </div>
          ) : (
            <span className="text-sm text-white/40">No prediction set</span>
          )}
        </div>
        <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>
      </div>
    )
  }

  // Confirmed state — prediction is set and not in editing mode
  if (selected && !isEditing) {
    return (
      <div className="space-y-3" ref={containerRef}>
        <div className="flex items-center gap-4 rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-5 py-4">
          {selectedTeam?.crest && (
            <Image src={selectedTeam.crest} alt="" width={36} height={36} className="max-h-9 w-auto object-contain shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#C9A84C] mb-0.5">Your pick</div>
            <div className="text-base font-bold text-white truncate">{selected}</div>
          </div>
          <CheckCircle2 className="h-5 w-5 text-[#C9A84C] shrink-0" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
          >
            Change
          </button>
          <span className="text-white/20">·</span>
          <form action={resetAction}>
            <input type="hidden" name="championshipId" value={championshipId} />
            <button
              type="submit"
              disabled={resetPending}
              className="text-xs text-red-400/70 hover:text-red-400 transition-colors underline underline-offset-2 disabled:opacity-50"
            >
              {resetPending ? 'Clearing…' : 'Reset prediction'}
            </button>
          </form>
          {resetState?.error && <span className="text-xs text-red-400">{resetState.error}</span>}
        </div>
      </div>
    )
  }

  // Edit / no-prediction state
  return (
    <div ref={containerRef} className="space-y-3">
      <div className="relative">
        <button
          type="button"
          onClick={openDropdown}
          className="w-full text-left bg-[#0A1628] text-white border border-white/20 rounded px-3 py-2 text-sm cursor-pointer hover:border-white/40 flex items-center gap-2"
        >
          {selectedTeam ? (
            <>
              {selectedTeam.crest && (
                <Image src={selectedTeam.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain shrink-0" />
              )}
              <span className="truncate">{selectedTeam.name}</span>
            </>
          ) : (
            <span className="text-white/40">Select a team…</span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 w-full rounded border border-white/20 bg-[#0A1628] shadow-2xl">
            <div className="p-2 border-b border-white/10">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team…"
                className="w-full bg-white/5 text-white text-xs rounded px-3 py-1.5 outline-none placeholder:text-white/30 border border-white/10 focus:border-white/30 caret-white"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-white/30 text-center">No results</div>
              ) : (
                filtered.map((team) => (
                  <button
                    key={team.name}
                    type="button"
                    onClick={() => pickTeam(team.name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                      team.name === selected ? 'text-[#C9A84C] bg-white/5' : 'text-white/70'
                    }`}
                  >
                    {team.crest && (
                      <Image src={team.crest} alt="" width={16} height={16} className="max-h-4 w-auto object-contain shrink-0" />
                    )}
                    {team.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <form action={saveAction}>
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="predictedTeam" value={selected ?? ''} />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={savePending || !selected}
            className="bg-[#C9A84C] hover:bg-[#C9A84C]/80 text-black font-semibold disabled:opacity-50"
          >
            {savePending ? 'Saving…' : 'Save prediction'}
          </Button>
          {isEditing && (
            <button
              type="button"
              onClick={() => { setSelected(existing); setIsEditing(false) }}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
          )}
          {saveState?.error && <span className="text-xs text-red-400">{saveState.error}</span>}
        </div>
      </form>
    </div>
  )
}
