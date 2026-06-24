'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, User, Settings, ShieldCheck } from 'lucide-react'
import { logout } from '@/actions/auth'

export function UsernameDropdown({
  username,
  isAdmin,
  canManage,
}: {
  username: string
  isAdmin: boolean
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {username}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-white/10 bg-[#0A1628] py-1 shadow-2xl">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            Profile
          </Link>
          {canManage && (
            <Link
              href="/manage"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#C9A84C] hover:text-[#F2D27A] hover:bg-white/5 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Manage
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-[#C9A84C] hover:text-[#F2D27A] hover:bg-white/5 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
          <div className="my-1 border-t border-white/10" />
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center px-4 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              Logout
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
