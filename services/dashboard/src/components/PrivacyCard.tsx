'use client'

import { useState } from 'react'
import { adminFetch } from '@/lib/admin-client'
import { useLoad } from '@/lib/useLoad'

/** Kartu pengaturan privasi (D6) — ditampilkan di halaman Users & Access (khusus admin). */
export default function PrivacyCard() {
  const [masked, setMasked] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLoad(async () => {
    try {
      const res = await fetch('/api/privacy', { cache: 'no-store', credentials: 'same-origin' })
      const data = (await res.json()) as { settings?: { mask_viewer_ips: boolean } }
      if (res.ok && data.settings) setMasked(data.settings.mask_viewer_ips)
    } catch {
      setError('Could not load the privacy setting.')
    }
  })

  async function toggle(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch('/api/privacy', { method: 'PUT', body: JSON.stringify({ mask_viewer_ips: next }) })
      const data = (await res.json()) as { settings?: { mask_viewer_ips: boolean }; error?: string }
      if (!res.ok || !data.settings) throw new Error(data.error ?? 'Failed to save')
      setMasked(data.settings.mask_viewer_ips)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-label="Client privacy">
      <h2 className="text-base font-semibold text-chalk">Client privacy</h2>
      <label className="mt-3 flex items-start gap-3 text-sm text-chalk">
        <input type="checkbox" className="mt-1" checked={masked === true} disabled={masked === null || busy} onChange={e => toggle(e.target.checked)} />
        <span>
          Hide client IP addresses from <strong>viewers</strong>
          <span className="block text-xs text-chalk-dim mt-0.5">
            Viewers see <code>10.0.0.x·a3f2c1</code> instead of the real address (clients stay distinguishable), cannot open client
            detail pages or labels, and cannot export client data. Administrators always see everything.
          </span>
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-xs text-flag">{error}</p>}
    </section>
  )
}
