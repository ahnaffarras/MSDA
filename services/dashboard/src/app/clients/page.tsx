'use client'

import Link from 'next/link'
import { Suspense, useCallback, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import TimeRangePicker from '@/components/TimeRangePicker'
import DeviceModal, { type DeviceForm } from '@/components/DeviceModal'
import Modal from '@/components/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useTimeRange } from '@/lib/useTimeRange'
import { useLoad } from '@/lib/useLoad'
import { adminFetch } from '@/lib/admin-client'
import { isMaskedIp } from '@/lib/masked'
import { timeAgo } from '@/lib/format'
import type { ClientDevice } from '@/lib/client-devices'

const nf = (n: number) => n.toLocaleString('en-GB')
const FIELD = 'px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none'

interface TrafficClient {
  ip: string
  label: string | null
  queries: number
  flagged: number
  domains: number
  aps: string[]
  last_seen: string | null
}

const clientHref = (ip: string) => `/clients/${encodeURIComponent(ip)}`

/* ───────────── Tab 1: klien yang terlihat di trafik ───────────── */
function TrafficTab({ query, isAdmin }: { query: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<TrafficClient[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [labelFor, setLabelFor] = useState<DeviceForm | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/clients?${query}&page=${page}${applied ? `&q=${encodeURIComponent(applied)}` : ''}`, { cache: 'no-store', credentials: 'same-origin' })
      const data = (await res.json()) as { data?: TrafficClient[]; meta?: { total: number; total_pages: number }; error?: string }
      if (!res.ok || !data.data || !data.meta) throw new Error(data.error ?? 'Failed to load clients')
      setRows(data.data)
      setTotal(data.meta.total)
      setPages(data.meta.total_pages)
      setNow(Date.now())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [query, page, applied])
  useLoad(load, 60_000, `${query}|${page}|${applied}`)

  return (
    <div className="space-y-4">
      <form onSubmit={e => { e.preventDefault(); setPage(1); setApplied(q.trim()) }} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={45} placeholder="IP starts with… (e.g. 192.168.10.)" className={`${FIELD} w-full sm:w-80`} aria-label="Filter by IP prefix" />
        <button type="submit" className="btn">Search</button>
      </form>
      {error && <p role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-3 text-sm text-flag">{error}</p>}
      <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-chalk-faint border-b border-line">
              <th className="px-4 py-3">Client</th><th className="px-4 py-3 text-right">Queries</th><th className="px-4 py-3 text-right">Flagged</th>
              <th className="px-4 py-3 text-right">Domains</th><th className="px-4 py-3">Access points</th><th className="px-4 py-3">Last seen</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-chalk-dim">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-chalk-dim">No clients seen in this period.</td></tr>
            ) : rows.map(r => (
              <tr key={r.ip} className="border-b border-line/60 last:border-0 align-top">
                <td className="px-4 py-3">
                  {isMaskedIp(r.ip) ? <span className="font-mono text-chalk">{r.ip}</span> : <Link href={clientHref(r.ip)} className="font-mono text-primary hover:underline">{r.ip}</Link>}
                  {r.label && <span className="block text-xs text-chalk-dim">{r.label}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-chalk">{nf(r.queries)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.flagged > 0 ? 'text-flag font-medium' : 'text-chalk-faint'}`}>{nf(r.flagged)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-chalk-dim">{nf(r.domains)}</td>
                <td className="px-4 py-3 text-xs text-chalk-dim">{r.aps.slice(0, 3).join(', ')}{r.aps.length > 3 ? ` +${r.aps.length - 3}` : ''}</td>
                <td className="px-4 py-3 text-xs text-chalk-dim whitespace-nowrap">{r.last_seen ? timeAgo(r.last_seen, now) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {isAdmin && !isMaskedIp(r.ip) && (
                    <button type="button" className="text-xs underline text-chalk-dim hover:text-chalk" onClick={() => setLabelFor({ ip: r.ip, label: r.label ?? '' })}>{r.label ? 'Edit label' : 'Add label'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="text-sm text-chalk-dim">Page {page} of {pages} · {nf(total)} clients</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </nav>
      )}
      {labelFor && <DeviceModal initial={labelFor} onClose={() => setLabelFor(null)} onSaved={() => { setLabelFor(null); void load() }} />}
    </div>
  )
}

/* ───────────── Tab 2: label perangkat (registry) ───────────── */
function LabelsTab({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<ClientDevice[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<DeviceForm | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [csv, setCsv] = useState('')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/client-devices?page=${page}${applied ? `&q=${encodeURIComponent(applied)}` : ''}`, { cache: 'no-store', credentials: 'same-origin' })
      const data = (await res.json()) as { data?: ClientDevice[]; meta?: { total_pages: number }; error?: string }
      if (!res.ok || !data.data || !data.meta) throw new Error(data.error ?? 'Failed to load labels')
      setRows(data.data)
      setPages(data.meta.total_pages)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load labels')
    } finally {
      setLoading(false)
    }
  }, [page, applied])
  useLoad(load, undefined, `${page}|${applied}`)

  async function remove(d: ClientDevice) {
    if (!window.confirm(`Remove the label “${d.label}” (${d.ip})?`)) return
    const res = await adminFetch(`/api/client-devices/${encodeURIComponent(d.id)}`, { method: 'DELETE' })
    if (res.ok) void load()
    else setError('Failed to delete the label.')
  }

  async function runImport() {
    setBusy(true)
    setImportMsg(null)
    try {
      const res = await adminFetch('/api/client-devices/import', { method: 'POST', body: JSON.stringify({ csv }) })
      const data = (await res.json()) as { created?: number; updated?: number; error?: string; error_count?: number; errors?: { line: number; reason: string }[] }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      const bad = (data.errors ?? []).slice(0, 5).map(e => `line ${e.line}: ${e.reason}`).join(' · ')
      setImportMsg(`Imported: ${data.created} new, ${data.updated} updated${data.error_count ? `, ${data.error_count} skipped (${bad}${(data.error_count ?? 0) > 5 ? ' …' : ''})` : '.'}`)
      void load()
    } catch (e: unknown) {
      setImportMsg(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={e => { e.preventDefault(); setPage(1); setApplied(q.trim()) }} className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} maxLength={100} placeholder="Search label, IP, owner…" className={`${FIELD} w-full sm:w-72`} aria-label="Search labels" />
          <button type="submit" className="btn">Search</button>
        </form>
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => { setImportOpen(true); setImportMsg(null) }}>Import CSV</button>
            <button type="button" className="btn btn-primary" onClick={() => setEdit({ ip: '' })}>Add label</button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-3 text-sm text-flag">{error}</p>}
      <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-chalk-faint border-b border-line">
              <th className="px-4 py-3">Label</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">MAC / host</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">IP history</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-chalk-dim">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-chalk-dim">{applied ? 'No labels match.' : 'No labels yet. Label a client from the “Active clients” tab, or import a CSV.'}</td></tr>
            ) : rows.map(d => (
              <tr key={d.id} className="border-b border-line/60 last:border-0 align-top">
                <td className="px-4 py-3 font-medium text-chalk">{d.label}{d.note && <span className="block text-xs font-normal text-chalk-faint">{d.note}</span>}</td>
                <td className="px-4 py-3 font-mono text-xs"><Link href={clientHref(d.ip)} className="text-primary hover:underline">{d.ip}</Link></td>
                <td className="px-4 py-3 text-xs text-chalk-dim font-mono">{d.mac ?? '—'}{d.hostname && <span className="block font-sans">{d.hostname}</span>}</td>
                <td className="px-4 py-3 text-xs text-chalk-dim">{d.owner ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-chalk-dim font-mono">{d.ip_history.length ? d.ip_history.map(h => h.ip).join(', ') : '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {isAdmin && (
                    <>
                      <button type="button" className="text-xs underline text-chalk-dim hover:text-chalk mr-3" onClick={() => setEdit({ ip: d.ip, label: d.label, mac: d.mac, hostname: d.hostname, owner: d.owner, note: d.note })}>Edit</button>
                      <button type="button" className="text-xs underline text-flag" onClick={() => remove(d)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="text-sm text-chalk-dim">Page {page} of {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </nav>
      )}
      {edit && <DeviceModal initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load() }} />}
      {importOpen && (
        <Modal title="Import labels from CSV" onClose={() => setImportOpen(false)}>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-chalk-dim">First row must be a header. Required columns: <code>ip</code>, <code>label</code>. Optional: <code>mac</code>, <code>hostname</code>, <code>owner</code>, <code>note</code>. Existing labels for the same MAC (or IP) are updated.</p>
            <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} className="text-xs" />
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={7} placeholder={'ip,label,mac\n192.168.10.25,Lab 1 PC 07,aa:bb:cc:dd:ee:07'} className={`${FIELD} w-full font-mono text-xs`} aria-label="CSV text" />
            {importMsg && <p role="status" className="rounded-lg border border-line bg-surface-2 p-2 text-xs text-chalk">{importMsg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setImportOpen(false)}>Close</button>
              <button type="button" className="btn btn-primary" disabled={busy || !csv.trim()} onClick={runImport}>{busy ? 'Importing…' : 'Import'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ClientsInner() {
  const { isAdmin } = useAuth()
  const { params, query, setRange } = useTimeRange()
  const [tab, setTab] = useState<'traffic' | 'labels'>('traffic')

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Clients' }]}
        title="Clients"
        description="Who is on the network, and what you call them. Give a device a label once and it shows up everywhere."
        actions={
          <div className="flex flex-wrap items-start justify-end gap-3">
            <div role="group" aria-label="View" className="seg">
              <button type="button" className="seg-btn" aria-pressed={tab === 'traffic'} onClick={() => setTab('traffic')}>Active clients</button>
              <button type="button" className="seg-btn" aria-pressed={tab === 'labels'} onClick={() => setTab('labels')}>Labels</button>
            </div>
            {tab === 'traffic' && <TimeRangePicker params={params} onChange={setRange} />}
          </div>
        }
      />
      <div className="page-x py-6 md:py-8">
        <div className="w-full max-w-7xl mx-auto">
          {tab === 'traffic' ? <TrafficTab query={query} isAdmin={isAdmin} /> : <LabelsTab isAdmin={isAdmin} />}
        </div>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsInner />
    </Suspense>
  )
}
