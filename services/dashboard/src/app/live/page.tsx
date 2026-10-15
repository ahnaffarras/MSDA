'use client'

import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { RiskBadge } from '@/components/Risk'
import { useLoad } from '@/lib/useLoad'
import { useClientLabels } from '@/lib/useClientLabels'
import { formatTimeWIB } from '@/lib/format'
import { isMaskedIp } from '@/lib/masked'

/**
 * Live feed (C7): aliran kejadian DNS terbaru. Memakai polling 3 detik ke /api/events?after=…
 * (berhenti saat tab tidak aktif), jadi tidak butuh koneksi langsung ke backend.
 */

interface LiveEvent {
  _id: string
  timestamp: string
  client_ip: string
  domain: string
  action: string
  risk_level: string
  ap_name: string
}

const POLL_MS = 3000
const KEEP = 500 // jumlah baris maksimum di memori
const SHOW = 200 // jumlah baris maksimum di layar
const FIELD = 'px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none'

export default function LivePage() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [paused, setPaused] = useState(false)
  const [pending, setPending] = useState(0)
  const [risk, setRisk] = useState<'all' | 'watch' | 'flag'>('all')
  const [q, setQ] = useState('')
  const [error, setError] = useState(false)
  const [started, setStarted] = useState(false)

  const lastTs = useRef<string | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const buffer = useRef<LiveEvent[]>([])
  const pausedRef = useRef(false)

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const url = lastTs.current
        ? `/api/events?range=24h&limit=200&after=${encodeURIComponent(lastTs.current)}`
        : '/api/events?range=24h&limit=50'
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) throw new Error(String(res.status))
      const fresh = ((await res.json()) as LiveEvent[]).filter(e => e._id && !seen.current.has(e._id))
      setError(false)
      setStarted(true)
      if (fresh.length === 0) return
      for (const e of fresh) seen.current.add(e._id)
      if (seen.current.size > KEEP * 4) seen.current = new Set([...seen.current].slice(-KEEP * 2))
      const newest = fresh.reduce((m, e) => (e.timestamp > m ? e.timestamp : m), lastTs.current ?? '')
      lastTs.current = newest

      if (pausedRef.current) {
        buffer.current = [...fresh, ...buffer.current].slice(0, KEEP)
        setPending(buffer.current.length)
      } else {
        setEvents(prev => [...fresh, ...prev].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, KEEP))
      }
    } catch {
      setError(true)
    }
  }, [])
  useLoad(poll, POLL_MS)

  function resume() {
    setEvents(prev => [...buffer.current, ...prev].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, KEEP))
    buffer.current = []
    setPending(0)
    pausedRef.current = false
    setPaused(false)
  }

  function pause() {
    pausedRef.current = true
    setPaused(true)
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return events
      .filter(e => (risk === 'all' ? true : risk === 'flag' ? e.risk_level === 'flag' : e.risk_level !== 'safe'))
      .filter(e => !needle || e.domain.toLowerCase().includes(needle) || e.client_ip.toLowerCase().includes(needle))
      .slice(0, SHOW)
  }, [events, risk, q])

  const labels = useClientLabels(visible.map(e => e.client_ip))

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Live Feed' }]}
        title="Live feed"
        description="DNS requests as they arrive, newest first. Updates every few seconds while this tab is open."
        actions={
          <div className="flex items-center gap-2">
            <span role="status" className={`text-xs font-medium ${error ? 'text-flag' : paused ? 'text-watch' : 'text-safe'}`}>
              {error ? 'Reconnecting…' : paused ? 'Paused' : started ? 'Live' : 'Connecting…'}
            </span>
            {paused ? (
              <button type="button" className="btn btn-primary" onClick={resume}>Resume{pending > 0 ? ` (${pending} new)` : ''}</button>
            ) : (
              <button type="button" className="btn" onClick={pause}>Pause</button>
            )}
          </div>
        }
      />
      <div className="page-x py-6 md:py-8">
        <div className="w-full max-w-7xl mx-auto space-y-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-medium text-chalk-dim">
              Show
              <select value={risk} onChange={e => setRisk(e.target.value as typeof risk)} className={`${FIELD} block mt-1`}>
                <option value="all">All requests</option>
                <option value="watch">Watch and flagged</option>
                <option value="flag">Flagged only</option>
              </select>
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              Filter
              <input value={q} onChange={e => setQ(e.target.value)} maxLength={100} placeholder="domain or client IP" className={`${FIELD} block mt-1 w-64`} />
            </label>
          </div>

          <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-chalk-faint border-b border-line">
                  <th className="px-4 py-3">Time (WIB)</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Domain</th><th className="px-4 py-3">Risk</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">AP</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-chalk-dim">{started ? 'Nothing matches yet. New requests will appear here.' : 'Loading…'}</td></tr>
                ) : visible.map(e => (
                  <tr key={e._id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-chalk">{formatTimeWIB(e.timestamp)}</td>
                    <td className="px-4 py-2">
                      {isMaskedIp(e.client_ip) ? <span className="font-mono text-xs text-chalk">{e.client_ip}</span> : <Link href={`/clients/${encodeURIComponent(e.client_ip)}`} className="font-mono text-xs text-primary hover:underline">{e.client_ip}</Link>}
                      {labels[e.client_ip] && <span className="ml-2 text-xs text-chalk-dim">{labels[e.client_ip]}</span>}
                    </td>
                    <td className="px-4 py-2 break-all"><Link href={`/domains/${encodeURIComponent(e.domain)}`} className="font-mono text-xs text-chalk hover:underline">{e.domain}</Link></td>
                    <td className="px-4 py-2"><RiskBadge level={e.risk_level} compact /></td>
                    <td className="px-4 py-2 text-chalk-dim">{e.action === 'blocked' ? 'Blocked' : 'Allowed'}</td>
                    <td className="px-4 py-2 text-xs text-chalk-dim">{e.ap_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-chalk-faint">Showing up to {SHOW} rows. Use the Clients and DNS Intelligence pages for history.</p>
        </div>
      </div>
    </div>
  )
}
