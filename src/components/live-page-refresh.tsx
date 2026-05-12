'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function LivePageRefresh() {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(interval)
  }, [router])

  return null
}
