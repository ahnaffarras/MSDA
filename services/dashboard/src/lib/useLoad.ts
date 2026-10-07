'use client'

import { useEffect, useRef } from 'react'

/**
 * Menjalankan fungsi pemuat data saat halaman dibuka, saat `key` berubah, dan
 * (opsional) berulang tiap `intervalMs`.
 *
 * Kenapa bukan useEffect langsung: pemuat data hampir selalu memanggil setState
 * (loading, hasil, error). Memanggilnya langsung dari effect memicu aturan lint
 * react-hooks/set-state-in-effect dan membuat render berantai. Di sini pemuat
 * disimpan di ref dan dijalankan setelah commit, jadi pemuat selalu memakai
 * state/props terbaru tanpa perlu menaruhnya di dependency array.
 */
export function useLoad(
  load: () => void | Promise<void>,
  intervalMs?: number,
  key: string | number = '',
) {
  const loadRef = useRef(load)

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    const run = () => {
      void loadRef.current()
    }
    run()
    if (!intervalMs) return
    const timer = setInterval(run, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, key])
}
