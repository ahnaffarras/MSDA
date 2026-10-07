'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { DnsEvent, Group, Node } from '@/lib/types'
import { RiskBadge, RiskMark, asRisk } from '@/components/Risk'
import BlockDomainButton, { useBlocklist } from '@/components/BlockDomain'
import { formatDateTimeWIB, timeAgo } from '@/lib/format'
import { sortByIp } from '@/lib/ip'
import { useLoad } from '@/lib/useLoad'
import PageHeader, { Segmented } from '@/components/PageHeader'

/** Bentuk respons /api/dns-info (hasil analisis AI yang disimpan n8n) */
interface DomainInfo {
  domain: string
  company: string
  registrar: string
  org: string
  asn: string
  city: string
  region: string
  ptr_hostname: string
  group: string
  type: string
  updated_date: string
  all_ips: { ip: string; type: string; geo: string }[]
}

type LoggedEvent = DnsEvent & { access_count?: number; type?: string; group?: string }

interface ApUsage {
  ap_ip: string
  label: string
  queries: number
  clients: Set<string>
  last: string
}

interface DomainStats {
  domain: string
  totalQueries: number
  riskLevel: string
  firstSeen: string
  lastSeen: string
  type: string
  group: string
  clients: string[]
  aps: ApUsage[]
}

/** AP terdaftar di Kelola Jaringan: ap_ip → kelas & node (untuk tautan) */
interface ApPlace {
  nodeId: string
  nodeName: string
  groupId: string
  groupName: string
}

const HOURS = [1, 6, 12, 24, 48]
const RISK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'safe', label: 'Normal' },
  { value: 'watch', label: 'Needs attention' },
  { value: 'flag', label: 'Risky' },
]
const PAGE_SIZE = 40
const RANK: Record<string, number> = { safe: 0, watch: 1, flag: 2 }

function Spinner() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div role="status" aria-label="Loading" className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--primary)' }} />
    </div>
  )
}

function buildStats(events: LoggedEvent[]): DomainStats[] {
  const map = new Map<string, DomainStats>()
  const clientSets = new Map<string, Set<string>>()

  for (const e of events) {
    if (!e.domain) continue
    const n = e.access_count && e.access_count > 0 ? e.access_count : 1
    const risk = asRisk(e.risk_level)

    let d = map.get(e.domain)
    if (!d) {
      d = {
        domain: e.domain,
        totalQueries: 0,
        riskLevel: risk,
        firstSeen: e.timestamp,
        lastSeen: e.timestamp,
        type: e.type ?? '',
        group: e.group ?? '',
        clients: [],
        aps: [],
      }
      map.set(e.domain, d)
      clientSets.set(e.domain, new Set())
    }
    d.totalQueries += n
    if (RANK[risk] > RANK[d.riskLevel]) d.riskLevel = risk
    if (e.timestamp > d.lastSeen) d.lastSeen = e.timestamp
    if (e.timestamp < d.firstSeen) d.firstSeen = e.timestamp
    if (!d.type && e.type) d.type = e.type
    if (!d.group && e.group) d.group = e.group
    clientSets.get(e.domain)!.add(e.client_ip)

    // Lintas-AP: domain yang sama bisa diakses dari beberapa AP
    const apKey = e.ap_ip || e.ap_name || '?'
    let ap = d.aps.find(a => a.ap_ip === apKey)
    if (!ap) {
      ap = { ap_ip: apKey, label: e.ap_name || e.ap_ip || 'Unknown AP', queries: 0, clients: new Set(), last: e.timestamp }
      d.aps.push(ap)
    }
    ap.queries += n
    ap.clients.add(e.client_ip)
    if (e.timestamp > ap.last) ap.last = e.timestamp
  }

  const list = [...map.values()]
  for (const d of list) {
    d.clients = sortByIp([...(clientSets.get(d.domain) ?? [])], ip => ip)
    d.aps.sort((a, b) => b.queries - a.queries)
  }
  return list.sort((a, b) => b.totalQueries - a.totalQueries)
}

function DnsIntelligenceContent() {
  const searchParams = useSearchParams()
  const domainParam = searchParams.get('domain')
  const clientParam = searchParams.get('client')

  const [events, setEvents] = useState<LoggedEvent[]>([])
  const [places, setPlaces] = useState<Record<string, ApPlace>>({})
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState(24)
  const [searchQuery, setSearchQuery] = useState(domainParam ?? '')
  const [riskFilter, setRiskFilter] = useState('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [openAps, setOpenAps] = useState<Set<string>>(new Set())
  const [openClients, setOpenClients] = useState<Set<string>>(new Set())
  const [info, setInfo] = useState<DomainInfo | null>(null)
  const [infoState, setInfoState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [now, setNow] = useState(() => Date.now())
  const blocklist = useBlocklist()

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?hours=${timeFilter}&limit=10000`)
      if (res.ok) {
        const data = await res.json()
        setEvents(Array.isArray(data) ? data : data.data || [])
      }
      setNow(Date.now())
    } catch (error) {
      console.error('Failed to fetch DNS events:', error)
    } finally {
      setLoading(false)
    }
  }, [timeFilter])
  useLoad(loadEvents, 60_000, timeFilter)

  // Peta AP → kelas/node, supaya "diakses di AP mana" bisa diklik ke halaman AP-nya
  const loadPlaces = useCallback(async () => {
    try {
      const [gRes, nRes] = await Promise.all([fetch('/api/groups'), fetch('/api/nodes')])
      const groups: Group[] = gRes.ok ? await gRes.json() : []
      const nodes: Node[] = nRes.ok ? await nRes.json() : []
      if (!Array.isArray(groups) || !Array.isArray(nodes)) return
      const byGroup = new Map(groups.map(g => [g.id, g.name]))
      const map: Record<string, ApPlace> = {}
      for (const n of nodes) {
        map[n.ap_ip] = { nodeId: n.id, nodeName: n.name, groupId: n.group_id, groupName: byGroup.get(n.group_id) ?? '' }
      }
      setPlaces(map)
    } catch (error) {
      console.error('Failed to fetch AP list:', error)
    }
  }, [])
  useLoad(loadPlaces)

  // Detail domain (pemilik, ISP, IP) saat datang dari halaman AP: ?domain=...
  const loadInfo = useCallback(async () => {
    if (!domainParam) return
    try {
      const res = await fetch(`/api/dns-info?search=${encodeURIComponent(domainParam)}`)
      const list: DomainInfo[] = res.ok ? await res.json() : []
      const d = domainParam.toLowerCase()
      // cocokkan persis dulu; kalau tidak ada, domain induk (i.ytimg.com → ytimg.com)
      const match =
        list.find(i => i.domain?.toLowerCase() === d) ||
        list.find(i => i.domain && d.endsWith(`.${i.domain.toLowerCase()}`)) ||
        null
      setInfo(match)
      setInfoState(match ? 'ready' : 'missing')
    } catch {
      setInfoState('missing')
    }
  }, [domainParam])
  useLoad(loadInfo, undefined, domainParam ?? '')

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return events.filter(e => {
      if (riskFilter !== 'all' && e.risk_level !== riskFilter) return false
      if (!q) return true
      return (
        e.domain?.toLowerCase().includes(q) ||
        e.client_ip?.includes(q) ||
        e.ap_ip?.includes(q) ||
        e.ap_name?.toLowerCase().includes(q)
      )
    })
  }, [events, searchQuery, riskFilter])

  const domainStats = useMemo(() => buildStats(filteredEvents), [filteredEvents])
  const totalQueries = useMemo(
    () => filteredEvents.reduce((s, e) => s + ((e as LoggedEvent).access_count || 1), 0),
    [filteredEvents],
  )

  const toggle = (setter: (f: (p: Set<string>) => Set<string>) => void, key: string) =>
    setter(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (loading) return <Spinner />

  const flagged = domainStats.filter(d => d.riskLevel === 'flag').length
  const watched = domainStats.filter(d => d.riskLevel === 'watch').length
  const shown = domainStats.slice(0, visible)

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'DNS Intelligence' }]}
        title="DNS Intelligence"
        description="Which domains are requested, from which AP, and by which client."
        actions={
          <Segmented
            label="Time range"
            value={timeFilter}
            onChange={h => { setTimeFilter(h); setVisible(PAGE_SIZE) }}
            options={HOURS.map(h => ({ value: h, label: `${h}h` }))}
          />
        }
      >
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
          {[
            ['Total queries', totalQueries.toLocaleString('en-GB'), ''],
            ['Unique domains', domainStats.length, ''],
            ['Risky domains', flagged, flagged > 0 ? 'text-flag' : ''],
            ['Need attention', watched, watched > 0 ? 'text-watch' : ''],
          ].map(([label, value, tone]) => (
            <div key={label as string}>
              <dt className="text-xs text-chalk-faint">{label}</dt>
              <dd className={`text-2xl font-semibold tabular-nums ${tone || 'text-chalk'}`}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col md:flex-row gap-3 mt-5">
          <label className="relative block flex-1">
            <span className="sr-only">Search by domain, client IP or AP</span>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-chalk-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setVisible(PAGE_SIZE) }}
              placeholder="Search by domain, client IP or AP name"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-line bg-surface-2 text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {RISK_FILTERS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => { setRiskFilter(f.value); setVisible(PAGE_SIZE) }}
                aria-pressed={riskFilter === f.value}
                className={`px-3 py-2 rounded-full text-sm border inline-flex items-center gap-2 ${
                  riskFilter === f.value ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-chalk-dim border-line hover:border-line-strong'
                }`}
              >
                {f.value !== 'all' && <RiskMark level={f.value} className="w-2.5 h-2.5" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="page-x py-5 md:py-8 space-y-6">
        {domainParam && (
          <section aria-labelledby="domain-detail" className="rounded-xl border border-line bg-surface overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-line bg-surface-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 id="domain-detail" className="font-mono text-base md:text-lg font-medium break-all text-chalk">{domainParam}</h2>
              {clientParam && (
                <span className="text-sm text-chalk-dim">
                  opened from client <span className="font-mono">{clientParam}</span>
                </span>
              )}
              <span className="ml-auto flex items-center gap-3">
                {blocklist.find(domainParam) ? (
                  <span className="text-sm font-medium text-flag">Already blocked</span>
                ) : (
                  <BlockDomainButton domain={domainParam} suggestedType={info?.type} suggestedGroup={info?.group} onBlocked={blocklist.reload} />
                )}
                <Link href="/dns-intelligence" className="text-sm font-medium underline underline-offset-4 text-primary">Clear selection</Link>
              </span>
            </div>
            {infoState === 'loading' && <p className="px-5 py-4 text-sm text-chalk-faint">Loading domain details…</p>}
            {infoState === 'missing' && (
              <p className="px-5 py-4 text-sm text-chalk-dim">
                This domain has not been analyzed yet. Owner and ISP details appear once the AI workflow in n8n has processed it; access statistics are still available below.
              </p>
            )}
            {info && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4 text-sm">
                {[
                  ['Owner / company', info.company !== '-' ? info.company : info.registrar],
                  ['Category', `${info.group} (${info.type})`],
                  ['ISP / hosting', info.org],
                  ['ASN', info.asn],
                  ['Server location', [info.city, info.region].filter(v => v && v !== '-').join(', ') || '-'],
                  ['PTR', info.ptr_hostname],
                  ['Last verified', info.updated_date],
                  ['IP addresses', info.all_ips.map(i => i.ip).slice(0, 4).join(', ') || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-chalk-faint">{label}</dt>
                    <dd className="mt-0.5 break-words text-chalk">{value || '-'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
            <p className="font-medium text-chalk">No matching DNS data</p>
            <p className="text-sm text-chalk-faint mt-1">Change the search, risk filter, or widen the time range.</p>
          </div>
        ) : (
          <section aria-labelledby="domains-heading">
            <h2 id="domains-heading" className="text-lg font-semibold text-chalk mb-3">
              Domain
              <span className="ml-2 text-sm font-normal text-chalk-faint">
                {searchQuery ? `results for “${searchQuery}” · ` : ''}{domainStats.length} {domainStats.length === 1 ? 'domain' : 'domains'}
              </span>
            </h2>

            <ul className="space-y-4">
              {shown.map(domain => {
                const maxQ = domain.aps[0]?.queries || 1
                const apsOpen = openAps.has(domain.domain)
                const clientsOpen = openClients.has(domain.domain)
                const aps = apsOpen ? domain.aps : domain.aps.slice(0, 4)
                const clients = clientsOpen ? domain.clients : domain.clients.slice(0, 10)
                const selected = domainParam?.toLowerCase() === domain.domain.toLowerCase()

                return (
                  <li
                    key={domain.domain}
                    className={`rounded-xl border bg-surface overflow-hidden ${selected ? 'border-primary' : 'border-line'}`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4 px-4 md:px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-2"><RiskMark level={domain.riskLevel} className="w-3.5 h-3.5" /></span>
                          <div className="min-w-0">
                            <h3 className="font-mono text-base font-semibold break-all">
                              <Link
                                href={`/dns-info?domain=${encodeURIComponent(domain.domain)}`}
                                className="text-chalk hover:text-primary hover:underline cursor-pointer transition-colors inline-flex items-center gap-1.5 group"
                                title={`View domain info for ${domain.domain}`}
                              >
                                <span>{domain.domain}</span>
                                <svg className="w-3.5 h-3.5 text-chalk-faint group-hover:text-primary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </Link>
                            </h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chalk-faint">
                              <RiskBadge level={domain.riskLevel} />
                              {domain.group && <span>{domain.group}</span>}
                              <span>First seen {formatDateTimeWIB(domain.firstSeen)}</span>
                              <span title={formatDateTimeWIB(domain.lastSeen)}>Last seen {timeAgo(domain.lastSeen, now)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 lg:gap-6">
                        <div className="tabular-nums">
                          <div className="text-xl font-semibold text-chalk">{domain.totalQueries.toLocaleString('en-GB')}</div>
                          <div className="text-xs text-chalk-faint">queries</div>
                        </div>
                        <div className="tabular-nums">
                          <div className="text-xl font-semibold text-chalk">{domain.clients.length}</div>
                          <div className="text-xs text-chalk-faint">client</div>
                        </div>
                        <div className="tabular-nums">
                          <div className="text-xl font-semibold text-chalk">{domain.aps.length}</div>
                          <div className="text-xs text-chalk-faint">AP</div>
                        </div>
                        <div className="ml-auto lg:ml-2">
                          {blocklist.find(domain.domain) ? (
                            <span className="text-xs font-medium text-flag">Blocked</span>
                          ) : (
                            <BlockDomainButton domain={domain.domain} suggestedType={domain.type} suggestedGroup={domain.group} onBlocked={blocklist.reload} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lintas-AP: domain ini sedang diakses di AP mana saja */}
                    <div className="border-t border-line">
                      <h4 className="px-4 md:px-5 pt-3 pb-1 text-sm font-semibold text-chalk">
                        Requested on {domain.aps.length} {domain.aps.length === 1 ? 'AP' : 'APs'}
                      </h4>
                      <ul className="divide-y divide-line">
                        {aps.map(ap => {
                          const place = places[ap.ap_ip]
                          const body = (
                            <>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-chalk truncate group-hover:text-primary">
                                  {place ? place.nodeName : ap.label}
                                </span>
                                <span className="block text-xs text-chalk-faint truncate">
                                  {place?.groupName ? `${place.groupName} · ` : ''}<span className="font-mono">{ap.ap_ip}</span>
                                </span>
                              </span>
                              <span className="hidden sm:block w-28 h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                                <span className="block h-full bg-primary" style={{ width: `${Math.max(6, (ap.queries / maxQ) * 100)}%` }} />
                              </span>
                              <span className="text-right text-sm tabular-nums text-chalk-dim whitespace-nowrap">
                                {ap.clients.size} {ap.clients.size === 1 ? 'client' : 'clients'} · {ap.queries.toLocaleString('en-GB')}×
                              </span>
                              <span className="hidden md:block w-24 text-right text-xs text-chalk-faint whitespace-nowrap">{timeAgo(ap.last, now)}</span>
                            </>
                          )
                          return (
                            <li key={ap.ap_ip}>
                              {place ? (
                                <Link
                                  href={`/networks/${place.groupId}/nodes/${place.nodeId}`}
                                  className="group flex items-center gap-3 px-4 md:px-5 py-2 hover:bg-surface-2"
                                  title="Open this AP"
                                >
                                  {body}
                                </Link>
                              ) : (
                                <div className="group flex items-center gap-3 px-4 md:px-5 py-2" title="This AP is not registered in Network Management">
                                  {body}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      {domain.aps.length > 4 && (
                        <button
                          type="button"
                          onClick={() => toggle(setOpenAps, domain.domain)}
                          aria-expanded={apsOpen}
                          className="w-full border-t border-line px-4 md:px-5 py-2 text-sm font-medium text-primary hover:bg-surface-2 text-left"
                        >
                          {apsOpen ? 'Show fewer' : `Show ${domain.aps.length - 4} more APs`}
                        </button>
                      )}
                    </div>

                    {/* Client, urut berdasarkan IP */}
                    <div className="border-t border-line px-4 md:px-5 py-3">
                      <h4 className="text-sm font-semibold text-chalk mb-2">Client</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {clients.map(ip => {
                          const highlighted = clientParam === ip
                          return (
                            <button
                              type="button"
                              key={ip}
                              onClick={() => { setSearchQuery(ip); setVisible(PAGE_SIZE) }}
                              title={`See all activity from ${ip}`}
                              className={`px-2 py-1 border rounded text-xs font-mono ${
                                highlighted ? 'border-primary bg-primary-light text-primary' : 'border-line bg-surface-2 text-chalk-dim hover:border-line-strong'
                              }`}
                            >
                              {ip}
                            </button>
                          )
                        })}
                        {domain.clients.length > 10 && (
                          <button
                            type="button"
                            onClick={() => toggle(setOpenClients, domain.domain)}
                            aria-expanded={clientsOpen}
                            className="px-2 py-1 text-xs font-medium text-primary"
                          >
                            {clientsOpen ? 'Show fewer' : `+${domain.clients.length - 10} more`}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {domainStats.length > visible && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setVisible(v => v + PAGE_SIZE)}
                  className="px-4 py-2 rounded-lg border border-line bg-surface text-sm font-medium text-chalk hover:border-line-strong"
                >
                  Show {Math.min(PAGE_SIZE, domainStats.length - visible)} more domains
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

/** key: pindah ke ?domain=... lain mereset pencarian & filter halaman */
function Keyed() {
  const params = useSearchParams()
  return <DnsIntelligenceContent key={`${params.get('domain') ?? ''}|${params.get('client') ?? ''}`} />
}

export default function DnsIntelligencePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Keyed />
    </Suspense>
  )
}
