'use client'

import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { DnsEvent, Group, Node } from '@/lib/types'
import { RiskBadge, RiskMark } from '@/components/Risk'
import BlockDomainButton, { useBlocklist } from '@/components/BlockDomain'
import PageHeader, { Segmented } from '@/components/PageHeader'
import StorageCard from '@/components/StorageCard'
import {
  RANGES,
  bucketLabel,
  buildHeadline,
  percentChange,
  rangeByHours,
  staleMinutes,
  type ApUsage,
  type OverviewData,
  type SeriesPoint,
} from '@/lib/overview'
import { timeAgo } from '@/lib/format'
import { sortByIp } from '@/lib/ip'
import { useLoad } from '@/lib/useLoad'

// Polling interval 8 detik untuk menjaga data tetap realtime jika websocket hening
const REFRESH_MS = 8_000
const nf = (n: number) => n.toLocaleString('en-GB')

interface ApPlace {
  nodeId: string
  nodeName: string
  groupId: string
  groupName: string
}

interface BoardRow {
  key: string
  name: string
  ap_ip: string
  href: string | null
  usage: ApUsage | null
}
interface Board {
  id: string
  name: string
  rows: BoardRow[]
}

/* ───────────────────────────── bagian kecil ───────────────────────────── */

function Panel({
  title,
  caption,
  action,
  alert = false,
  className = '',
  children,
}: {
  title: string
  caption?: string
  action?: React.ReactNode
  /** Tepi atas merah: panel ini sedang memuat sesuatu yang perlu tindakan */
  alert?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`chalk-surface flex flex-col rounded-xl border border-line bg-surface min-w-0 ${alert ? 'border-t-2 border-t-flag' : ''} ${className}`}>
      <header className="flex items-baseline justify-between gap-3 px-4 md:px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-chalk">{title}</h2>
          {caption && <p className="text-xs text-chalk-faint mt-0.5">{caption}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * Keadaan kosong. Mengisi tinggi kartu (flex-1) dan berada di tengah, jadi kartu
 * yang kosong tetap sejajar dan sama tinggi dengan tetangganya — bukan lubang di grid.
 * `ok` = kosong karena memang tidak ada masalah (centang), bukan karena belum ada data.
 */
function Empty({ children, ok = false, compact = false }: { children: React.ReactNode; ok?: boolean; compact?: boolean }) {
  if (compact) return <p className="px-4 md:px-5 pb-4 text-sm text-chalk-faint">{children}</p>
  return (
    <div className="flex-1 grid place-items-center border-t border-line px-6 py-8 text-center min-h-36">
      <div className="flex flex-col items-center gap-2.5">
        <span
          className={`grid place-items-center w-9 h-9 rounded-full border ${
            ok ? 'border-safe-border bg-safe-bg text-safe' : 'border-dashed border-line-strong text-chalk-faint'
          }`}
          aria-hidden="true"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M4 12h3l2-5 4 10 2-5h5" />}
          </svg>
        </span>
        <p className="text-sm text-chalk-faint max-w-[34ch] text-balance">{children}</p>
      </div>
    </div>
  )
}

function ToneMark({ tone }: { tone: 'safe' | 'watch' | 'flag' | 'idle' }) {
  if (tone === 'idle') {
    return (
      <svg className="w-4 h-4 mt-[3px] flex-shrink-0 text-chalk-faint" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }
  return <RiskMark level={tone} className="w-4 h-4 mt-[3px]" />
}

function TrafficChart({ series, bucketMs }: { series: SeriesPoint[]; bucketMs: number }) {
  const max = Math.max(1, ...series.map(s => s.queries))
  const peak = series.reduce((a, b) => (b.queries > a.queries ? b : a), series[0])
  const step = Math.max(1, Math.ceil(series.length / 6))
  const total = series.reduce((a, s) => a + s.queries, 0)

  if (total === 0) return <Empty>No traffic in this range yet.</Empty>

  return (
    <div className="flex-1 flex flex-col px-4 md:px-5 pb-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-chalk-dim mb-3">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-primary" />Query</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-flag" />Risky access</span>
        <span className="ml-auto text-chalk-faint">
          Peak {bucketLabel(peak.start, bucketMs)} · <span className="font-mono">{nf(peak.queries)}</span> queries
        </span>
      </div>

      {/* Area plot memanjang mengikuti tinggi kartu; batang mengisi penuh lewat inset-0 */}
      <div className="relative flex-1 min-h-44 ml-9" role="img" aria-label={`Traffic chart, peak ${nf(peak.queries)} queries at ${bucketLabel(peak.start, bucketMs)}`}>
        {[0, 0.5, 1].map(f => (
          <div key={f} className="absolute left-0 right-0 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -left-9 w-8 text-right text-[11px] font-mono text-chalk-faint -translate-y-1/2">
              {nf(Math.round(max * f))}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {series.map(s => {
            const h = (s.queries / max) * 100
            const flagShare = s.queries > 0 ? (s.flagged / s.queries) * 100 : 0
            return (
              <div
                key={s.start}
                className="flex-1 min-w-0 h-full flex items-end hover:opacity-75"
                title={`${bucketLabel(s.start, bucketMs)} — ${nf(s.queries)} queries${s.flagged ? `, ${nf(s.flagged)} risky` : ''}`}
              >
                {s.queries === 0 ? (
                  <div className="w-full h-[2px] bg-line-strong" />
                ) : (
                  <div className="w-full flex flex-col justify-end overflow-hidden rounded-t-[3px]" style={{ height: `max(3px, ${h}%)` }}>
                    <div className="flex-1 bg-primary" />
                    {s.flagged > 0 && <div className="bg-flag" style={{ height: `${Math.max(flagShare, 12)}%` }} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 ml-9 flex gap-[3px] text-[11px] text-chalk-faint">
        {series.map((s, i) => (
          <div key={s.start} className="flex-1 min-w-0 relative h-4">
            {i % step === 0 && <span className="absolute left-0 whitespace-nowrap">{bucketLabel(s.start, bucketMs)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Composition({ totals }: { totals: OverviewData['totals'] }) {
  const safe = Math.max(0, totals.queries - totals.flagged - totals.watch)
  const rows = [
    { level: 'safe', label: 'Normal', n: safe },
    { level: 'watch', label: 'Needs attention', n: totals.watch },
    { level: 'flag', label: 'Risky', n: totals.flagged },
  ] as const
  if (totals.queries === 0) return <Empty compact>No data yet.</Empty>
  return (
    <div className="px-4 md:px-5 pb-4">
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-3 gap-[2px]" role="img" aria-label="Access composition by risk">
        {rows.map(r =>
          r.n > 0 ? (
            <div key={r.level} style={{ flexGrow: r.n, minWidth: 5, backgroundColor: `var(--accent-${r.level})` }} />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(r => (
          <li key={r.level} className="flex items-center gap-2">
            <RiskMark level={r.level} className="w-2.5 h-2.5" />
            <span className="text-chalk-dim mr-auto">{r.label}</span>
            <span className="font-mono tnum text-chalk">{nf(r.n)}</span>
            <span className="w-12 text-right font-mono tnum text-xs text-chalk-faint">
              {((r.n / totals.queries) * 100).toFixed(r.n / totals.queries < 0.1 && r.n > 0 ? 1 : 0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Skeleton() {
  const b = 'rounded-xl bg-surface-3 animate-pulse'
  return (
    <div aria-hidden="true">
      <div className="page-head">
        <div className="page-x py-7 space-y-3">
          <div className="h-3 w-48 rounded bg-surface-3 animate-pulse" />
          <div className="h-9 w-full max-w-xl rounded bg-surface-3 animate-pulse" />
          <div className="h-4 w-full max-w-md rounded bg-surface-3 animate-pulse" />
        </div>
      </div>
      <div className="page-x py-6 space-y-4">
        <div className={`${b} h-24`} />
        <div className={`${b} h-24`} />
        <div className="grid xl:grid-cols-[minmax(0,1fr)_24rem] gap-4">
          <div className={`${b} h-72`} />
          <div className={`${b} h-72`} />
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── halaman ───────────────────────────── */

export default function HomePage() {
  const [hours, setHours] = useState(24)
  const [data, setData] = useState<OverviewData | null>(null)
  const [events, setEvents] = useState<(DnsEvent & { _id?: string })[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting')

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const blocklist = useBlocklist()

  const range = rangeByHours(hours)

  const load = useCallback(async () => {
    try {
      setRefreshing(true)
      const [oRes, eRes, gRes, nRes] = await Promise.all([
        fetch(`/api/overview?hours=${hours}`),
        fetch(`/api/events?hours=${hours}&limit=12`),
        fetch('/api/groups'),
        fetch('/api/nodes'),
      ])
      if (!oRes.ok) throw new Error('overview failed')
      setData((await oRes.json()) as OverviewData)
      if (eRes.ok) {
        const e = await eRes.json()
        setEvents(Array.isArray(e) ? e : [])
      }
      const g = gRes.ok ? await gRes.json() : []
      const n = nRes.ok ? await nRes.json() : []
      setGroups(Array.isArray(g) ? g : [])
      setNodes(Array.isArray(n) ? n : [])
      setFailed(false)
      setNow(Date.now())
    } catch (error) {
      console.error('Failed to load overview:', error)
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
  }, [hours])

  // Polling reguler setiap 8 detik agar data terus sinkron
  useLoad(load, REFRESH_MS, hours)

  // Koneksi WebSocket ke backend (/ws/dashboard) untuk push realtime dari n8n/vector
  useEffect(() => {
    let unmounted = false

    function connectWs() {
      if (unmounted) return
      setWsStatus(prev => (prev === 'connected' ? 'reconnecting' : 'connecting'))

      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        // Backend port 8081 diexpose ke host
        const wsUrl = `${proto}//${window.location.hostname}:8081/ws/dashboard`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (unmounted) return
          setWsStatus('connected')
          retryCountRef.current = 0
          // Saat berhasil terhubung, muat data terbaru
          void load()
        }

        ws.onmessage = () => {
          if (unmounted) return
          // Saat ada broadcast webhook baru (misal blacklist_alert atau update)
          void load()
        }

        ws.onerror = () => {
          // onError akan memicu onclose
        }

        ws.onclose = () => {
          if (unmounted) return
          setWsStatus('reconnecting')
          // Exponential backoff reconnect (maksimal 15s)
          const delay = Math.min(15_000, 1000 * Math.pow(1.5, retryCountRef.current))
          retryCountRef.current += 1
          reconnectTimeoutRef.current = setTimeout(connectWs, delay)
        }
      } catch {
        if (!unmounted) {
          setWsStatus('disconnected')
          reconnectTimeoutRef.current = setTimeout(connectWs, 5000)
        }
      }
    }

    connectWs()

    return () => {
      unmounted = true
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [load])

  const places = useMemo(() => {
    const byGroup = new Map(groups.map(g => [g.id, g.name]))
    const map: Record<string, ApPlace> = {}
    for (const n of nodes) {
      map[n.ap_ip] = { nodeId: n.id, nodeName: n.name, groupId: n.group_id, groupName: byGroup.get(n.group_id) ?? '' }
    }
    return map
  }, [groups, nodes])

  /** Papan AP: dikelompokkan per kelas; AP terdaftar tanpa lalu lintas ikut tampil sebagai "sepi". */
  const boards = useMemo<Board[]>(() => {
    if (!data) return []
    const usage = new Map(data.aps.map(a => [a.ap_ip, a]))
    const used = new Set<string>()
    const out: Board[] = []

    for (const g of groups) {
      const rows: BoardRow[] = nodes
        .filter(n => n.group_id === g.id)
        .map(n => {
          used.add(n.ap_ip)
          return { key: n.id, name: n.name, ap_ip: n.ap_ip, href: `/networks/${g.id}/nodes/${n.id}`, usage: usage.get(n.ap_ip) ?? null }
        })
      if (rows.length) out.push({ id: g.id, name: g.name, rows })
    }
    const extra: BoardRow[] = data.aps
      .filter(a => !used.has(a.ap_ip))
      .map(a => ({ key: a.ap_ip, name: a.label, ap_ip: a.ap_ip, href: null, usage: a }))
    if (extra.length) out.push({ id: '_unregistered', name: out.length ? 'Not registered in Network Management' : 'Access points', rows: extra })
    return out
  }, [data, groups, nodes])

  if (failed && !data) {
    return (
      <div className="page-x py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-flag-border bg-flag-bg p-6 text-center">
          <p className="font-medium text-flag">Overview could not be loaded</p>
          <p className="text-sm text-chalk-dim mt-1">Check the database connection and try again.</p>
          <button type="button" onClick={load} className="mt-4 px-4 py-2 rounded-lg bg-surface border border-line text-sm font-medium text-chalk hover:bg-surface-2">
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!data || now === null) return <Skeleton />

  const t = data.totals
  const headline = buildHeadline(data, range.label)
  const stale = staleMinutes(data.last_event_at, now)
  const change = percentChange(t.queries, t.prev_queries)
  const maxApQueries = Math.max(1, ...data.aps.map(a => a.queries))
  const maxTop = Math.max(1, ...data.top_domains.map(d => d.queries))
  const when = new Date(data.generated_at)
  const dateLabel = when.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long' })
  const timeLabel = when.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })

  const stats: { label: string; value: string; tone?: string; edge?: boolean; sub: React.ReactNode }[] = [
    {
      label: 'DNS queries',
      value: nf(t.queries),
      sub:
        change === null ? (
          <span>no earlier period to compare</span>
        ) : (
          <span>
            <span aria-hidden="true">{change >= 0 ? '↑' : '↓'}</span> {Math.abs(change)}% vs previous {range.label}
          </span>
        ),
    },
    { label: 'Clients', value: nf(t.clients), sub: <span>{nf(t.active_now)} active in the last 10 min</span> },
    { label: 'Unique domains', value: nf(t.domains), sub: <span>{nf(data.attention.length)} to review</span> },
    {
      label: 'Risky access',
      value: nf(t.flagged),
      tone: t.flagged > 0 ? 'text-flag' : undefined,
      edge: t.flagged > 0,
      sub: <span>{nf(t.watch)} need attention</span>,
    },
    {
      label: 'Active blocklist',
      value: nf(data.blacklist.active),
      sub: (
        <Link href="/blacklist" className="underline decoration-line-strong underline-offset-4 hover:text-chalk">
          {data.blacklist.total - data.blacklist.active > 0 ? `${data.blacklist.total - data.blacklist.active} inactive · manage` : 'manage list'}
        </Link>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Indikator Status Realtime / Reconnect */}
            {wsStatus === 'connected' ? (
              <span className="inline-flex items-center gap-2 rounded-lg border-2 border-safe-border bg-safe-bg px-4 py-2 text-sm font-semibold text-safe shadow-sm">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-75 animate-ping" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-signal" />
                </span>
                REALTIME
              </span>
            ) : wsStatus === 'reconnecting' ? (
              <span className="inline-flex items-center gap-2 rounded-lg border-2 border-watch-border bg-watch-bg px-4 py-2 text-sm font-semibold text-watch shadow-sm">
                <span className="w-3 h-3 rounded-full bg-watch animate-pulse" />
                RECONNECTING...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-lg border-2 border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-chalk shadow-sm">
                <span className="w-3 h-3 rounded-full bg-primary/70 animate-pulse" />
                POLLING (8s)
              </span>
            )}

            <span className="text-xs text-chalk-dim">{dateLabel} · {timeLabel} WIB</span>
            {data.last_event_at && stale === null && (
              <span className="text-xs text-chalk-faint">Last data {timeAgo(data.last_event_at, now)}</span>
            )}

          </div>
        }
        title="Network overview"
        description="Live DNS activity across every access point. Synchronized in realtime with backend."
        actions={
          <Segmented
            label="Time range"
            value={hours}
            onChange={setHours}
            options={RANGES.map(r => ({ value: r.hours, label: r.short }))}
          />
        }
      >
        <div
          className={`mt-5 flex items-start gap-3 rounded-lg border px-4 py-3 ${
            headline.tone === 'flag'
              ? 'border-flag-border bg-flag-bg'
              : headline.tone === 'watch'
                ? 'border-watch-border bg-watch-bg'
                : headline.tone === 'safe'
                  ? 'border-safe-border bg-safe-bg'
                  : 'border-line bg-surface-2'
          }`}
        >
          <ToneMark tone={headline.tone} />
          <p className="text-sm leading-relaxed">
            <span className="font-semibold text-chalk">{headline.title}.</span>{' '}
            <span className="text-chalk-dim">{headline.detail}</span>
          </p>
        </div>
        {stale !== null && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-watch-border bg-watch-bg px-3 py-1.5 text-sm text-watch">
            <RiskMark level="watch" className="w-3 h-3" />
            Data stopped arriving. Last seen {stale >= 120 ? `${Math.round(stale / 60)} hours` : `${stale} minutes`} ago
          </p>
        )}
      </PageHeader>

      <div className="page-x py-5 md:py-7 space-y-5">
        {failed && (
          <div role="alert" className="rounded-lg border border-flag-border bg-flag-bg px-4 py-3 text-sm text-flag flex items-center justify-between">
            <span>The last refresh failed, so you are seeing earlier data. Retrying automatically.</span>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-3 underline font-medium text-xs text-flag hover:opacity-80"
            >
              Retry now
            </button>
          </div>
        )}

        {/* Angka utama: satu jalur, bukan empat kartu kembar */}
        <dl className="chalk-surface grid grid-cols-2 lg:grid-cols-6 gap-px rounded-xl overflow-hidden border border-line bg-line">
          {stats.map((s, i) => (
            <div key={s.label} className={`relative bg-surface px-4 md:px-5 py-4 min-w-0 ${i === 0 ? 'col-span-2' : ''}`}>
              {s.edge && <span className="absolute inset-x-0 top-0 h-0.5 bg-flag" aria-hidden="true" />}
              <dt className="text-xs font-medium text-chalk-faint">{s.label}</dt>
              <dd className={`mt-1.5 font-mono leading-none font-medium tnum ${i === 0 ? 'text-[2.5rem]' : 'text-[1.75rem]'} ${s.tone ?? 'text-chalk'}`}>{s.value}</dd>
              <dd className="mt-2 text-xs leading-snug text-chalk-faint">{s.sub}</dd>
            </div>
          ))}
        </dl>

        {/* Penyimpanan: ukuran database, pemakaian disk, status pembersihan otomatis */}
        <StorageCard />

        {/* Komposisi risiko: pita tipis, bukan kartu tinggi, supaya tidak meninggalkan ruang kosong di kolom */}
        <Panel title="Access composition" caption={`By risk level · last ${range.label}`}>
          <Composition totals={t} />
        </Panel>

        {/*
          Baris 1: grafik + "Perlu dicek". items-stretch (bawaan grid) membuat keduanya sama tinggi;
          grafik dan keadaan kosong mengisi sisa tinggi, jadi tidak ada lubang di bawah salah satunya.
        */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-5">
          <Panel
            title="To review"
            caption={`Risky or flagged domains · last ${range.label}`}
            alert={data.attention.some(a => a.risk === 'flag')}
            className="xl:col-start-2 xl:row-start-1"
          >
            {data.attention.length === 0 ? (
              <Empty ok>No domains to review in this range.</Empty>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-line border-t border-line max-h-[21rem] overflow-y-auto">
                  {data.attention.map(a => {
                    const blocked = blocklist.find(a.domain)
                    return (
                      <li key={a.domain} className="flex items-center gap-3 pl-4 md:pl-5 pr-3 py-3">
                        <RiskMark level={a.risk} className="w-3 h-3" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/dns-intelligence?domain=${encodeURIComponent(a.domain)}`}
                            className="block font-mono text-sm text-chalk truncate hover:text-primary"
                            title={`View details for ${a.domain}`}
                          >
                            {a.domain}
                          </Link>
                          <p className="text-xs text-chalk-faint truncate">
                            {nf(a.clients)} {a.clients === 1 ? 'client' : 'clients'} · {a.aps.slice(0, 2).join(', ') || 'Unknown AP'}
                            {a.aps.length > 2 ? ` +${a.aps.length - 2}` : ''}
                          </p>
                        </div>
                        <span className="font-mono tnum text-sm text-chalk-dim">{nf(a.queries)}×</span>
                        {blocked ? (
                          <span className="text-xs font-medium text-flag whitespace-nowrap" title="Already on the blocklist">Blocked</span>
                        ) : (
                          <BlockDomainButton compact domain={a.domain} suggestedType={a.type} suggestedGroup={a.group} onBlocked={blocklist.reload} />
                        )}
                      </li>
                    )
                  })}
                </ul>
                <Link
                  href="/dns-intelligence"
                  className="mt-auto border-t border-line px-4 md:px-5 py-2.5 text-sm font-medium text-primary hover:bg-surface-2 rounded-b-xl"
                >
                  Open DNS Intelligence
                </Link>
              </>
            )}
          </Panel>

          <Panel
            title="Traffic"
            caption={`DNS queries per ${range.bucketMs >= 86_400_000 ? 'day' : range.bucketMs >= 3_600_000 ? 'hour' : `${range.bucketMs / 60_000} minutes`}`}
            className="xl:col-start-1 xl:row-start-1"
          >
            <TrafficChart series={data.series} bucketMs={data.bucket_ms} />
          </Panel>
        </div>

        {/* Baris 2: access point — tiap kelas jadi kartu kecil yang melebar mengisi baris */}
        <Panel
          title="Access points"
          caption="Load per AP; APs with no traffic are marked idle"
          action={<Link href="/settings" className="text-sm font-medium text-primary underline underline-offset-4">Manage</Link>}
        >
          {boards.length === 0 ? (
            <Empty>No access points yet. Add classes and APs in Network Management, or wait for the first log to arrive.</Empty>
          ) : (
            <div className="grid gap-3 p-3 md:p-4 pt-1 md:pt-1 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
              {boards.map(board => {
                const total = board.rows.reduce((sum, r) => sum + (r.usage?.queries ?? 0), 0)
                const ordered = sortByIp(board.rows, r => r.ap_ip)
                return (
                  <div key={board.id} className="rounded-lg border border-line bg-surface-2 min-w-0 overflow-hidden">
                    <div className="flex items-baseline justify-between gap-3 px-3 py-2 border-b border-line">
                      <h3 className="text-xs font-semibold text-chalk-dim truncate">{board.name}</h3>
                      <span className="text-xs text-chalk-faint font-mono tnum whitespace-nowrap">{nf(total)} queries</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {ordered.map(r => {
                        const u = r.usage
                        const inner = (
                          <>
                            <span className="flex items-baseline gap-2">
                              <span className="mr-auto min-w-0 truncate text-sm font-medium text-chalk group-hover:text-primary">{r.name}</span>
                              {u ? (
                                <span className="font-mono tnum text-sm text-chalk">{nf(u.queries)}</span>
                              ) : (
                                <span className="text-xs text-chalk-faint">idle</span>
                              )}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 text-xs text-chalk-faint">
                              <span className="font-mono truncate">{r.ap_ip}</span>
                              {u && <span className="whitespace-nowrap">{nf(u.clients)} {u.clients === 1 ? 'client' : 'clients'}</span>}
                              {u && u.flagged > 0 && (
                                <span className="ml-auto inline-flex items-center gap-1 font-medium text-flag">
                                  <RiskMark level="flag" className="w-2.5 h-2.5" />
                                  {nf(u.flagged)}
                                </span>
                              )}
                            </span>
                            <span className="mt-2 block h-1 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                              {u && <span className="block h-full rounded-full bg-flow" style={{ width: `${Math.max(3, (u.queries / maxApQueries) * 100)}%` }} />}
                            </span>
                          </>
                        )
                        return (
                          <li key={r.key}>
                            {r.href ? (
                              <Link href={r.href} className="group block px-3 py-2.5 hover:bg-surface-3/60">
                                {inner}
                              </Link>
                            ) : (
                              <div className="group block px-3 py-2.5">{inner}</div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {/* Baris 3: dua daftar sejajar, sama tinggi */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel title="Top domains" caption={`Most requested · last ${range.label}`}>
            {data.top_domains.length === 0 ? (
              <Empty>No domain data in this range yet.</Empty>
            ) : (
              <ol className="flex-1 border-t border-line">
                {data.top_domains.map(d => (
                  <li key={d.domain} className="relative">
                    <span
                      className="absolute inset-y-0 left-0 bg-primary-light"
                      style={{ width: `${(d.queries / maxTop) * 100}%` }}
                      aria-hidden="true"
                    />
                    <Link
                      href={`/dns-intelligence?domain=${encodeURIComponent(d.domain)}`}
                      className="relative flex items-center gap-3 px-4 md:px-5 py-2 hover:bg-surface-3/60"
                    >
                      <RiskMark level={d.risk} className="w-2.5 h-2.5" />
                      <span className="font-mono text-sm text-chalk truncate mr-auto">{d.domain}</span>
                      <span className="font-mono tnum text-sm text-chalk-dim">{nf(d.queries)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Clients with most risky requests" caption={`Last ${range.label}`}>
            {data.risky_clients.length === 0 ? (
              <Empty ok>No clients accessed risky domains.</Empty>
            ) : (
              <ul className="flex-1 divide-y divide-line border-t border-line">
                {data.risky_clients.map(c => {
                  const place = places[c.ap_ip]
                  const body = (
                    <>
                      <span className="min-w-0 mr-auto">
                        <span className="block font-mono text-sm text-chalk">{c.client_ip}</span>
                        <span className="block text-xs text-chalk-faint truncate">
                          {place ? `${place.groupName ? `${place.groupName} · ` : ''}${place.nodeName}` : c.ap_label || c.ap_ip}
                        </span>
                      </span>
                      <span className="text-right text-xs text-chalk-faint">
                        <span className="block font-mono tnum text-sm text-flag">{nf(c.queries)}×</span>
                        {nf(c.domains)} {c.domains === 1 ? 'domain' : 'domains'}
                      </span>
                    </>
                  )
                  return (
                    <li key={`${c.client_ip}|${c.ap_ip}`}>
                      {place ? (
                        <Link href={`/networks/${place.groupId}/nodes/${place.nodeId}`} className="flex items-center gap-3 px-4 md:px-5 py-2.5 hover:bg-surface-2">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 md:px-5 py-2.5">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* Aktivitas terbaru */}
        <Panel
          title="Recent activity"
          caption="Latest 12 queries from all APs"
          action={<Link href="/client-access" className="text-sm font-medium text-primary underline underline-offset-4">All logs</Link>}
        >
          {events.length === 0 ? (
            <Empty>No activity in this range yet.</Empty>
          ) : (
            <ul className="border-t border-line divide-y divide-line">
              {events.map((e, i) => {
                const time = new Date(e.timestamp).toLocaleTimeString('en-GB', {
                  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                })
                return (
                  <li
                    key={`${e.timestamp}-${e.client_ip}-${e.domain}-${i}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[6rem_9.5rem_minmax(0,1fr)_10rem_8.5rem] items-center gap-x-4 gap-y-0.5 px-4 md:px-5 py-2.5"
                  >
                    <span className="hidden md:block font-mono tnum text-sm text-chalk-faint">{time}</span>
                    <span className="hidden md:block font-mono text-sm text-chalk-dim">{e.client_ip}</span>
                    <span className="min-w-0">
                      <Link
                        href={`/dns-intelligence?domain=${encodeURIComponent(e.domain)}&client=${encodeURIComponent(e.client_ip)}`}
                        className="block font-mono text-sm text-chalk truncate hover:text-primary"
                      >
                        {e.domain}
                      </Link>
                      <span className="md:hidden block text-xs text-chalk-faint truncate">
                        {time} · {e.client_ip} · {e.ap_name || e.ap_ip}
                      </span>
                    </span>
                    <span className="hidden md:block text-sm text-chalk-dim truncate">{e.ap_name || e.ap_ip}</span>
                    <span className="justify-self-end">
                      <RiskBadge level={e.risk_level} />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
