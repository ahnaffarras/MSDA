'use client'

import { useCallback, useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import type { Group, Node, DnsEvent } from '@/lib/types'
import type { NodeClient } from '@/app/api/node-clients/route'
import { RiskBadge, RiskMark, asRisk } from '@/components/Risk'
import { formatDateTimeWIB, timeAgo } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import { sortByIp } from '@/lib/ip'
import BlockDomainButton, { useBlocklist } from '@/components/BlockDomain'
import PageHeader, { Segmented } from '@/components/PageHeader'

const HOURS = [1, 6, 12, 24, 48]
const RISK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'watch', label: 'Needs attention' },
  { value: 'flag', label: 'Risky' },
]
const SORTS = [
  { value: 'ip', label: 'IP (low → high)' },
  { value: 'ip-desc', label: 'IP (high → low)' },
  { value: 'recent', label: 'Most recently active' },
  { value: 'queries', label: 'Most queries' },
] as const
type SortKey = (typeof SORTS)[number]['value']
const PREVIEW_DOMAINS = 6
const ACTIVE_WINDOW_MS = 5 * 60 * 1000 // 5 menit
const REFRESH_MS = 30_000

const dnsLink = (domain: string, client?: string) =>
  `/dns-intelligence?domain=${encodeURIComponent(domain)}${client ? `&client=${encodeURIComponent(client)}` : ''}`

function Spinner() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div
        role="status"
        aria-label="Loading"
        className="w-10 h-10 border-4 rounded-full animate-spin"
        style={{ borderColor: 'var(--line)', borderTopColor: 'var(--primary)' }}
      />
    </div>
  )
}

export default function NodeDetailPage({ params }: { params: Promise<{ id: string; nodeId: string }> }) {
  const { id: groupId, nodeId } = use(params)

  const [group, setGroup] = useState<Group | null>(null)
  const [node, setNode] = useState<Node | null>(null)
  const [clients, setClients] = useState<NodeClient[]>([])
  const [recent, setRecent] = useState<DnsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [hours, setHours] = useState(24)
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('ip')
  const blocklist = useBlocklist()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => Date.now())

  // Grup & node (sekali)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [gRes, nRes] = await Promise.all([
          fetch(`/api/groups?id=${groupId}`),
          fetch(`/api/nodes?group_id=${groupId}`),
        ])
        const gData = gRes.ok ? await gRes.json() : []
        const nData = nRes.ok ? await nRes.json() : []
        if (cancelled) return
        setGroup(Array.isArray(gData) ? gData.find((g: Group) => g.id === groupId) ?? null : null)
        setNode(Array.isArray(nData) ? nData.find((n: Node) => n.id === nodeId) ?? null : null)
      } catch (e) {
        console.error('Failed to fetch node:', e)
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, nodeId])

  // Client + domain + aktivitas terbaru; refresh otomatis
  const apIp = node?.ap_ip
  const load = useCallback(async () => {
    if (!apIp) return
    try {
      const enc = encodeURIComponent(apIp)
      const [cRes, eRes] = await Promise.all([
        fetch(`/api/node-clients?ap_ip=${enc}&hours=${hours}`),
        fetch(`/api/events?ap_ip=${enc}&hours=${hours}&limit=40`),
      ])
      if (cRes.ok) {
        const data = await cRes.json()
        setClients(Array.isArray(data.clients) ? data.clients : [])
        setFailed(false)
      } else {
        setFailed(true)
      }
      if (eRes.ok) {
        const data = await eRes.json()
        setRecent(Array.isArray(data) ? data : [])
      }
      setNow(Date.now())
    } catch (e) {
      console.error('Failed to fetch client activity:', e)
      setFailed(true)
    }
  }, [apIp, hours])

  useLoad(load, REFRESH_MS, `${apIp}|${hours}`)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = clients.filter(c => {
      if (riskFilter !== 'all' && c.risk !== riskFilter) return false
      if (!q) return true
      return c.client_ip.includes(q) || c.domains.some(d => d.domain.toLowerCase().includes(q))
    })
    // IP DHCP berubah-ubah, jadi urutan default mengikuti IP secara numerik
    // (.3, .4, .8, .12 — bukan .12 sebelum .3 seperti urutan teks).
    switch (sort) {
      case 'ip':
        return sortByIp(list, c => c.client_ip, 'asc')
      case 'ip-desc':
        return sortByIp(list, c => c.client_ip, 'desc')
      case 'queries':
        return [...list].sort((a, b) => b.query_count - a.query_count)
      default:
        return [...list].sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
    }
  }, [clients, query, riskFilter, sort])

  // Hitung client yang benar-benar aktif saat ini (dalam ACTIVE_WINDOW_MS)
  const activeClientsCount = useMemo(() => {
    return clients.filter(c => now - new Date(c.last_seen).getTime() < ACTIVE_WINDOW_MS).length
  }, [clients, now])

  // Catat waktu log terakhir yang diterima node ini
  const latestSeen = useMemo(() => {
    let max = ''
    if (recent.length > 0 && recent[0].timestamp) {
      max = recent[0].timestamp
    }
    for (const c of clients) {
      if (!max || c.last_seen > max) max = c.last_seen
    }
    return max
  }, [clients, recent])

  // Status Online hanya jika node menerima log dalam kurun waktu ACTIVE_WINDOW_MS
  const isNodeOnline = useMemo(() => {
    if (!latestSeen) return false
    return now - new Date(latestSeen).getTime() < ACTIVE_WINDOW_MS
  }, [latestSeen, now])

  const totals = useMemo(() => {
    const domains = new Set<string>()
    let queries = 0
    let attention = 0
    clients.forEach(c => {
      queries += c.query_count
      if (c.risk !== 'safe') attention++
      c.domains.forEach(d => domains.add(d.domain))
    })
    return { queries, attention, domains: domains.size }
  }, [clients])

  const toggle = (ip: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(ip)) next.delete(ip)
      else next.add(ip)
      return next
    })

  if (loading) return <Spinner />

  if (!group || !node) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2 text-chalk">Node not found</h1>
          <p className="text-sm text-chalk-dim mb-4">
            {failed ? 'The data could not be loaded. Check the database connection.' : 'This node may have been deleted.'}
          </p>
          <Link href="/settings" className="text-primary font-medium underline underline-offset-4">
            Open Network Management
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: group.name, href: `/networks/${group.id}` }, { label: node.name }]}
        title={node.name}
        description={
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="font-mono text-sm text-chalk">{node.ap_ip}</span>
            <span className="text-line-strong" aria-hidden="true">|</span>
            <span className="text-sm text-chalk-dim">{node.device_type}</span>
            <span className="text-line-strong" aria-hidden="true">|</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isNodeOnline ? 'bg-safe/10 text-safe' : 'bg-surface-3 text-chalk-faint'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isNodeOnline ? 'bg-safe animate-pulse' : 'bg-line-strong'}`} />
              {isNodeOnline ? 'Online' : 'Offline'}
            </span>
            {latestSeen && (
              <>
                <span className="text-line-strong" aria-hidden="true">|</span>
                <span className="text-xs text-chalk-faint" title={formatDateTimeWIB(latestSeen)}>
                  Last activity: {timeAgo(latestSeen, now)}
                </span>
              </>
            )}
            {node.description ? <span className="text-chalk-faint text-sm"> — {node.description}</span> : null}
          </div>
        }
        actions={
          <Segmented
            label="Time range"
            value={hours}
            onChange={setHours}
            options={HOURS.map(h => ({ value: h, label: `${h}h` }))}
          />
        }
      >
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="text-xs text-chalk-faint">Active clients</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${activeClientsCount > 0 ? 'text-safe' : 'text-chalk-faint'}`}>
              {activeClientsCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-chalk-faint">Total clients ({hours}h)</dt>
            <dd className="text-2xl font-semibold tabular-nums text-chalk">
              {clients.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-chalk-faint">Total queries</dt>
            <dd className="text-2xl font-semibold tabular-nums text-chalk">
              {totals.queries.toLocaleString('en-GB')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-chalk-faint">Unique domains</dt>
            <dd className="text-2xl font-semibold tabular-nums text-chalk">
              {totals.domains}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-chalk-faint">Clients to review</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${totals.attention > 0 ? 'text-watch' : 'text-chalk'}`}>
              {totals.attention}
            </dd>
          </div>
        </dl>
      </PageHeader>

      <div className="page-x py-5 md:py-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-6">
        {/* Daftar client */}
        <section aria-labelledby="clients-heading" className="min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 id="clients-heading" className="text-lg font-semibold text-chalk sm:mr-auto">
              Clients on {node.name}
              <span className="ml-2 text-sm font-normal text-chalk-faint">
                {filtered.length} of {clients.length}
                {activeClientsCount > 0 ? ` (${activeClientsCount} active now)` : ' (0 active now)'}
              </span>
            </h2>
            <label className="relative block sm:w-64">
              <span className="sr-only">Search by client IP or domain</span>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-chalk-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search IP or domain"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-surface text-chalk placeholder-chalk-faint text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="flex items-center gap-2 text-sm text-chalk-dim sm:mr-2">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-chalk"
              >
                {SORTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            {RISK_FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setRiskFilter(f.value)}
                aria-pressed={riskFilter === f.value}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  riskFilter === f.value
                    ? 'bg-chalk text-background border-chalk'
                    : 'bg-surface text-chalk-dim border-line hover:border-line-strong'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {failed && (
            <p role="alert" className="mb-4 rounded-lg border border-flag-border bg-flag-bg text-flag px-4 py-3 text-sm">
              Client data could not be loaded. Try again shortly; this page retries automatically every 30 seconds.
            </p>
          )}

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
              <p className="font-medium text-chalk">
                {clients.length === 0 ? `No clients detected in the last ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'No clients match the filters'}
              </p>
              <p className="text-sm text-chalk-faint mt-1">
                {clients.length === 0
                  ? 'Try a longer time range, or make sure this MikroTik is sending DNS logs.'
                  : 'Clear the search or choose "All".'}
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {filtered.map(client => {
                const isOpen = expanded.has(client.client_ip)
                const shown = isOpen ? client.domains : client.domains.slice(0, PREVIEW_DOMAINS)
                const hidden = client.domains.length - shown.length
                const active = now - new Date(client.last_seen).getTime() < ACTIVE_WINDOW_MS
                const panelId = `domains-${client.client_ip.replace(/\W/g, '-')}`

                return (
                  <li key={client.client_ip} className="rounded-xl border border-line bg-surface overflow-hidden">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 md:px-5 py-4">
                      <div className="min-w-0 mr-auto">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-medium text-chalk">{client.client_ip}</span>
                          <RiskBadge level={client.risk} />
                          {active && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-safe">
                              <span className="w-1.5 h-1.5 rounded-full bg-safe animate-pulse" aria-hidden="true" />
                              Active now
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-chalk-dim">
                          Last accessed{' '}
                          <Link
                            href={dnsLink(client.last_domain, client.client_ip)}
                            className="font-mono text-chalk underline decoration-line-strong underline-offset-4 hover:decoration-primary break-all"
                          >
                            {client.last_domain}
                          </Link>
                          <span className="text-chalk-faint" title={formatDateTimeWIB(client.last_seen)}> · {timeAgo(client.last_seen, now)}</span>
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-xl font-semibold text-chalk">{client.query_count.toLocaleString('en-GB')}</div>
                        <div className="text-xs text-chalk-faint">queries · {client.domain_count} {client.domain_count === 1 ? 'domain' : 'domains'}</div>
                      </div>
                    </div>

                    <ul id={panelId} className="border-t border-line divide-y divide-line">
                      {shown.map(d => (
                        <li key={d.domain} className="flex items-center hover:bg-surface-2">
                          <Link
                            href={dnsLink(d.domain, client.client_ip)}
                            className="group flex flex-1 min-w-0 items-center gap-3 pl-4 md:pl-5 pr-2 py-2.5"
                            title={`View ${d.domain} in DNS Intelligence`}
                          >
                            <RiskMark level={d.risk} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono text-sm text-chalk truncate group-hover:text-primary">{d.domain}</span>
                              {d.group && d.group !== 'Unknown' && (
                                <span className="block text-xs text-chalk-faint truncate">{d.group}</span>
                              )}
                            </span>
                            <span className="hidden sm:block text-xs text-chalk-faint whitespace-nowrap">{timeAgo(d.last_seen, now)}</span>
                            <span className="text-sm tabular-nums text-chalk-dim whitespace-nowrap">{d.count}×</span>
                          </Link>
                          <span className="pr-3 md:pr-4 flex-shrink-0">
                            {blocklist.find(d.domain) ? (
                              <span className="text-xs font-medium text-flag px-2 py-1" title="This domain is already on the blocklist">Blocked</span>
                            ) : (
                              <BlockDomainButton
                                compact
                                domain={d.domain}
                                suggestedType={d.type}
                                suggestedGroup={d.group}
                                onBlocked={blocklist.reload}
                              />
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {client.domains.length > PREVIEW_DOMAINS && (
                      <button
                        type="button"
                        onClick={() => toggle(client.client_ip)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="w-full border-t border-line px-4 md:px-5 py-2.5 text-sm font-medium text-primary hover:bg-surface-2 text-left"
                      >
                        {isOpen ? 'Show fewer' : `Show ${hidden} more domains`}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Recent activity */}
        <aside aria-labelledby="recent-heading" className="min-w-0">
          <div className="rounded-xl border border-line bg-surface overflow-hidden xl:sticky xl:top-6">
            <div className="px-4 py-3 border-b border-line bg-surface-2">
              <h2 id="recent-heading" className="font-semibold text-chalk">Recent activity</h2>
              <p className="text-xs text-chalk-faint">Updates automatically every 30 seconds</p>
            </div>
            {recent.length === 0 ? (
              <p className="p-5 text-sm text-chalk-faint">No activity yet.</p>
            ) : (
              <ul className="max-h-[32rem] overflow-y-auto divide-y divide-line">
                {recent.map((e, i) => (
                  <li key={`${e.timestamp}-${i}`}>
                    <Link href={dnsLink(e.domain, e.client_ip)} className="block px-4 py-2.5 hover:bg-surface-2">
                      <span className="flex items-center gap-2">
                        <RiskMark level={asRisk(e.risk_level)} className="w-2.5 h-2.5" />
                        <span className="font-mono text-sm text-chalk truncate">{e.domain}</span>
                      </span>
                      <span className="mt-0.5 flex justify-between gap-2 text-xs text-chalk-faint">
                        <span className="font-mono">{e.client_ip}</span>
                        <span>{timeAgo(e.timestamp, now)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
