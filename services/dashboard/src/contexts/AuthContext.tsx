'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { PublicUser } from '@/lib/auth-types'
import { redirectToLogin } from '@/lib/admin-client'
import { useLoad } from '@/lib/useLoad'

interface AuthState {
  user: PublicUser | null
  /** true selama pengecekan sesi pertama belum selesai */
  loading: boolean
  isAdmin: boolean
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

/** Cek ulang sesi secara berkala supaya sesi yang habis / dicabut langsung membawa ke halaman login. */
const RECHECK_MS = 2 * 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onLogin = pathname === '/login'
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(!onLogin)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      if (res.status === 401) {
        setUser(null)
        redirectToLogin()
        return
      }
      if (!res.ok) return // gangguan sementara: pertahankan keadaan sekarang
      const data = (await res.json()) as { user: PublicUser }
      setUser(data.user)
    } catch {
      /* jaringan putus — coba lagi pada pengecekan berikutnya */
    } finally {
      setLoading(false)
    }
  }, [])

  // Cek sesi saat halaman dibuka lalu berkala (tidak dijalankan di halaman login)
  const check = useCallback(async () => {
    if (!onLogin) await refresh()
  }, [onLogin, refresh])
  useLoad(check, RECHECK_MS)

  // Kembali ke tab ini → cek sesi segera
  useEffect(() => {
    if (onLogin) return
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [onLogin, refresh])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      // Navigasi penuh disengaja: membuang seluruh state klien milik sesi lama
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login')
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, isAdmin: user?.role === 'admin', logout, refresh }),
    [user, loading, logout, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return { user: null, loading: false, isAdmin: false, logout: async () => {}, refresh: async () => {} }
  }
  return ctx
}
