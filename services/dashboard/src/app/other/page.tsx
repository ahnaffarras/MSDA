'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OtherRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/labs/all')
  }, [router])
  return null
}
