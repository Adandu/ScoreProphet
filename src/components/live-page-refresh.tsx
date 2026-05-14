'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  isLive: boolean
}

export function LivePageRefresh({ isLive }: Props) {
  const router = useRouter()

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => router.refresh(), 5_000)
    return () => clearInterval(interval)
  }, [isLive, router])

  return null
}
