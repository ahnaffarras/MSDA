'use client'

import { useState } from 'react'
import Modal from '@/components/Modal'
import { adminFetch } from '@/lib/admin-client'

const FIELD =
  'px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none w-full mt-1'

export interface DeviceForm {
  ip: string
  label?: string
  mac?: string
  hostname?: string
  owner?: string
  note?: string
}

/** Dialog untuk memberi/mengubah label perangkat (C3). Khusus admin; server tetap memvalidasi. */
export default function DeviceModal({ initial, onClose, onSaved }: { initial: DeviceForm; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<DeviceForm>({ label: '', mac: '', hostname: '', owner: '', note: '', ...initial })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof DeviceForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch('/api/client-devices', { method: 'POST', body: JSON.stringify(form) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setBusy(false)
    }
  }

  return (
    <Modal title="Client label" onClose={onClose}>
      <form onSubmit={save} className="space-y-3 text-sm">
        <label className="block text-xs font-medium text-chalk-dim">
          IP address
          <input value={form.ip} onChange={set('ip')} required className={FIELD} placeholder="192.168.10.25" />
        </label>
        <label className="block text-xs font-medium text-chalk-dim">
          Label (what you call this device)
          <input value={form.label ?? ''} onChange={set('label')} required maxLength={80} className={FIELD} placeholder="Lab 1 — PC 07" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-chalk-dim">
            MAC (optional)
            <input value={form.mac ?? ''} onChange={set('mac')} className={FIELD} placeholder="aa:bb:cc:dd:ee:ff" />
          </label>
          <label className="block text-xs font-medium text-chalk-dim">
            Hostname (optional)
            <input value={form.hostname ?? ''} onChange={set('hostname')} className={FIELD} />
          </label>
        </div>
        <label className="block text-xs font-medium text-chalk-dim">
          Owner (optional)
          <input value={form.owner ?? ''} onChange={set('owner')} maxLength={80} className={FIELD} />
        </label>
        <label className="block text-xs font-medium text-chalk-dim">
          Note (optional)
          <input value={form.note ?? ''} onChange={set('note')} maxLength={300} className={FIELD} />
        </label>
        <p className="text-xs text-chalk-faint">With a MAC address the label follows the device when its IP changes, and the old IPs are kept as history.</p>
        {error && <p role="alert" className="text-xs text-flag">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
