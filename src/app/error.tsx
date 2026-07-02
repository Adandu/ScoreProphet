'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
      <p className="text-sm text-white/50">An error occurred loading this page.</p>
      <button
        onClick={reset}
        className="rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
      >
        Try again
      </button>
    </div>
  )
}
