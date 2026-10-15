'use client'

import { useCallback, useState } from 'react'
import Modal from '@/components/Modal'
import { adminFetch } from '@/lib/admin-client'
import { useLoad } from '@/lib/useLoad'
import { formatDateTimeWIB } from '@/lib/format'

const FIELD = 'px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none'

interface AllowItem {
  _id: string
  domain: string
  note: string
  created_by: string
  created_at: string | null
}

function AllowlistModal({ isAdmin, onClose, onChanged }: { isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<AllowItem[]>([])
  const [domain, setDomain] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/allowlist', { cache: 'no-store', credentials: 'same-origin' })
      const data = (await res.json()) as AllowItem[] | { error?: string }
      if (!res.ok || !Array.isArray(data)) throw new Error((data as { error?: string }).error ?? 'Failed to load')
      setItems(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load the allowlist')
    }
  }, [])
  useLoad(load)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch('/api/allowlist', { method: 'POST', body: JSON.stringify({ domain, note }) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to add')
      setDomain('')
      setNote('')
      await load()
      onChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  async function remove(i: AllowItem) {
    const res = await adminFetch(`/api/allowlist/${i._id}`, { method: 'DELETE' })
    if (res.ok) {
      await load()
      onChanged()
    } else setError('Failed to remove the entry.')
  }

  return (
    <Modal title="Allowlist" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-chalk-dim">
          Domains here are <strong>never blocked</strong>, even if they (or a parent domain) are on the blocklist. Adding <code>example.com</code> also covers <code>cdn.example.com</code>.
        </p>
        {isAdmin && (
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <input value={domain} onChange={e => setDomain(e.target.value)} required placeholder="example.com" aria-label="Domain" className={`${FIELD} flex-1 min-w-40 font-mono`} />
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Reason (optional)" aria-label="Reason" className={`${FIELD} flex-1 min-w-40`} />
            <button type="submit" className="btn btn-primary" disabled={busy || !domain.trim()}>Add</button>
          </form>
        )}
        {error && <p role="alert" className="text-xs text-flag">{error}</p>}
        <ul className="max-h-64 overflow-y-auto divide-y divide-line border border-line rounded-lg">
          {items.length === 0 ? (
            <li className="p-3 text-xs text-chalk-faint">The allowlist is empty.</li>
          ) : items.map(i => (
            <li key={i._id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block font-mono text-sm text-chalk break-all">{i.domain}</span>
                <span className="block text-[11px] text-chalk-faint">{i.note || 'No reason given'}{i.created_by ? ` · ${i.created_by}` : ''}{i.created_at ? ` · ${formatDateTimeWIB(i.created_at)}` : ''}</span>
              </span>
              {isAdmin && <button type="button" className="text-xs underline text-flag shrink-0" onClick={() => remove(i)}>Remove</button>}
            </li>
          ))}
        </ul>
        <div className="flex justify-end"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  )
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await adminFetch('/api/blacklist/import', { method: 'POST', body: JSON.stringify({ csv }) })
      const data = (await res.json()) as { created?: number; skipped_count?: number; skipped?: { line: number; reason: string }[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      const why = (data.skipped ?? []).slice(0, 5).map(s => `line ${s.line}: ${s.reason}`).join(' · ')
      setMsg(`${data.created} added${data.skipped_count ? `, ${data.skipped_count} skipped (${why}${(data.skipped_count ?? 0) > 5 ? ' …' : ''})` : '.'}`)
      onDone()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import blocklist from CSV" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-chalk-dim">
          Header row required. Column <code>domain</code> is required; optional: <code>type</code>, <code>group</code>, <code>description</code>, <code>note</code>, <code>expires_at</code> (YYYY-MM-DD). Domains already listed, invalid, or on the allowlist are skipped.
        </p>
        <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" className="text-xs" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={7} aria-label="CSV text" placeholder={'domain,type,expires_at\nbet99.example,gambling,2026-12-31'} className={`${FIELD} w-full font-mono text-xs`} />
        {msg && <p role="status" className="rounded-lg border border-line bg-surface-2 p-2 text-xs text-chalk">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" disabled={busy || !csv.trim()} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Alat blocklist: ekspor/impor CSV dan pengelola allowlist. Impor & ubah allowlist khusus admin. */
export default function BlocklistTools({ isAdmin, onChanged }: { isAdmin: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<'allow' | 'import' | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href="/api/blacklist/export" className="btn" download>Export CSV</a>
      {isAdmin && <button type="button" className="btn" onClick={() => setOpen('import')}>Import CSV</button>}
      <button type="button" className="btn" onClick={() => setOpen('allow')}>Allowlist</button>
      {open === 'allow' && <AllowlistModal isAdmin={isAdmin} onClose={() => setOpen(null)} onChanged={onChanged} />}
      {open === 'import' && <ImportModal onClose={() => setOpen(null)} onDone={onChanged} />}
    </div>
  )
}
