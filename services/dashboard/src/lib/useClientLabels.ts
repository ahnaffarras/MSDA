'use client'

import { useCallback, useState } from 'react'
import { useLoad } from '@/lib/useLoad'
import { isValidIp } from '@/lib/client-devices'

/**
 * Peta ip → label perangkat (C3) untuk daftar IP yang sedang tampil. Kosong bila belum ada label
 * atau bila peran pengguna tidak boleh melihatnya (penyamaran privasi aktif).
 */
export function useClientLabels(ips: string[]): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({})
  const key = [...new Set(ips.filter(isValidIp))].sort().slice(0, 200).join(',')

  const load = useCallback(async () => {
    if (!key) {
      setLabels({})
      return
    }
    try {
      const res = await fetch(`/api/client-devices/lookup?ips=${encodeURIComponent(key)}`, { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) return
      const data = (await res.json()) as { labels?: Record<string, string> }
      setLabels(data.labels ?? {})
    } catch {
      /* label hanyalah tambahan tampilan; abaikan kegagalan */
    }
  }, [key])
  useLoad(load, undefined, key)

  return labels
}
