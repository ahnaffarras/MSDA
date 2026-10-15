'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useLoad } from '@/lib/useLoad'
import { fetchUnreadSummary } from '@/lib/api'

/**
 * Pembaruan notifikasi tanpa reload (B3, tahap 1: polling).
 *  - Menanyakan /notifications/unread-count tiap 20 detik; BERHENTI saat tab tidak aktif
 *    dan langsung menyegarkan begitu tab kembali terlihat.
 *  - Bila ada notifikasi baru: toast + event `msda:notifications-changed` agar halaman
 *    yang terbuka (mis. daftar Notifications) memuat ulang datanya.
 */

export const NOTIFICATIONS_CHANGED_EVENT = 'msda:notifications-changed'
const POLL_MS = 20_000
const TOAST_MS = 8_000

interface ToastItem {
  id: number
  message: string
  critical: boolean
}

interface NotificationsState {
  unread: number
  critical: number
  /** Segarkan badge sekarang (dipanggil setelah mengubah status). */
  refresh: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsState | undefined>(undefined)

function Toast({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onClose(toast.id), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast.id, onClose])

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface chalk-surface shadow-lg px-4 py-3 text-sm max-w-sm ${
        toast.critical ? 'border-flag-border' : 'border-line'
      }`}
    >
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${toast.critical ? 'bg-flag' : 'bg-watch'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-chalk">{toast.message}</p>
        <Link href="/notifications" onClick={() => onClose(toast.id)} className="text-xs text-primary hover:underline">
          View notifications
        </Link>
      </div>
      <button type="button" onClick={() => onClose(toast.id)} aria-label="Dismiss" className="text-chalk-faint hover:text-chalk leading-none text-lg">
        ×
      </button>
    </div>
  )
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState({ unread: 0, critical: 0 })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const prev = useRef<{ latest: string | null; unread: number } | null>(null)
  const nextId = useRef(1)

  const refresh = useCallback(async () => {
    try {
      const s = await fetchUnreadSummary()
      const before = prev.current
      prev.current = { latest: s.latest_id || null, unread: s.unread }
      setCounts({ unread: s.unread, critical: s.critical })

      if (before && (s.latest_id || null) !== before.latest) {
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
        if (s.unread > before.unread) {
          const n = s.unread - before.unread
          const message = `${n} new ${n === 1 ? 'alert' : 'alerts'}${s.critical > 0 ? ' (critical)' : ''}`
          setToasts(list => [...list.slice(-2), { id: nextId.current++, message, critical: s.critical > 0 }])
        }
      }
    } catch {
      /* gangguan sementara: pertahankan badge terakhir, coba lagi di siklus berikutnya */
    }
  }, [])

  // Polling berkala, dilewati saat tab tersembunyi
  useLoad(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    return refresh()
  }, POLL_MS)

  // Begitu tab terlihat lagi, segarkan segera (tanpa menunggu siklus berikutnya)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const closeToast = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), [])
  const value = useMemo(() => ({ ...counts, refresh }), [counts, refresh])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-[calc(100vw-2rem)]" aria-live="polite">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onClose={closeToast} />
        ))}
      </div>
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>')
  return ctx
}
