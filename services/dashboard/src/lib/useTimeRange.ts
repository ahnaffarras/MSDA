'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { rangeQuery, resolveRange, type RangeParams } from '@/lib/time-range'

/**
 * Rentang waktu global (C1) yang disimpan di query string URL, jadi bisa dibagikan
 * dan bertahan saat reload. Komponen yang memakai hook ini harus berada di dalam
 * <Suspense> (syarat useSearchParams pada halaman yang di-prerender).
 */
export function useTimeRange() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const range = sp.get('range')
  const from = sp.get('from')
  const to = sp.get('to')
  const params = useMemo<RangeParams>(() => ({ range, from, to }), [range, from, to])

  /** Query-string siap kirim ke API, mis. "range=7d". Server menghitung batas waktunya sendiri. */
  const query = useMemo(() => rangeQuery(params), [params])
  /** Rentang yang sudah dihitung (label, bucket, dll.) untuk tampilan. */
  const resolved = useMemo(() => resolveRange(params), [params])

  const setRange = useCallback(
    (next: RangeParams) => {
      const p = new URLSearchParams(sp.toString())
      for (const k of ['range', 'from', 'to']) p.delete(k)
      new URLSearchParams(rangeQuery(next)).forEach((v, k) => p.set(k, v))
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [sp, router, pathname],
  )

  return { params, query, resolved, setRange }
}
