'use client'

import { useTransition } from 'react'
import { updateTimezone } from '@/actions/auth'

export const TIMEZONES = [
  { value: 'Etc/GMT+12', label: 'UTC-12' },
  { value: 'Etc/GMT+11', label: 'UTC-11' },
  { value: 'Etc/GMT+10', label: 'UTC-10' },
  { value: 'Etc/GMT+9',  label: 'UTC-9' },
  { value: 'Etc/GMT+8',  label: 'UTC-8' },
  { value: 'Etc/GMT+7',  label: 'UTC-7' },
  { value: 'Etc/GMT+6',  label: 'UTC-6' },
  { value: 'Etc/GMT+5',  label: 'UTC-5' },
  { value: 'Etc/GMT+4',  label: 'UTC-4' },
  { value: 'Etc/GMT+3',  label: 'UTC-3' },
  { value: 'Etc/GMT+2',  label: 'UTC-2' },
  { value: 'Etc/GMT+1',  label: 'UTC-1' },
  { value: 'UTC',        label: 'UTC' },
  { value: 'Etc/GMT-1',  label: 'UTC+1' },
  { value: 'Etc/GMT-2',  label: 'UTC+2' },
  { value: 'Etc/GMT-3',  label: 'UTC+3' },
  { value: 'Etc/GMT-4',  label: 'UTC+4' },
  { value: 'Etc/GMT-5',  label: 'UTC+5' },
  { value: 'Etc/GMT-6',  label: 'UTC+6' },
  { value: 'Etc/GMT-7',  label: 'UTC+7' },
  { value: 'Etc/GMT-8',  label: 'UTC+8' },
  { value: 'Etc/GMT-9',  label: 'UTC+9' },
  { value: 'Etc/GMT-10', label: 'UTC+10' },
  { value: 'Etc/GMT-11', label: 'UTC+11' },
  { value: 'Etc/GMT-12', label: 'UTC+12' },
]

export function TimezoneSelector({ timezone }: { timezone: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <select
      value={timezone}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value
        startTransition(async () => {
          await updateTimezone(value)
        })
      }}
      className="bg-[#0A1628] text-white/50 text-xs border border-white/20 rounded px-2 py-1 cursor-pointer hover:border-white/40 disabled:opacity-50"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value} className="bg-[#0A1628]">
          {tz.label}
        </option>
      ))}
    </select>
  )
}
