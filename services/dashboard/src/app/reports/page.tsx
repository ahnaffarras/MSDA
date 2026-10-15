'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import ReportText from '@/components/ReportText'
import { RiskBadge, asRisk } from '@/components/Risk'
import { formatDateTimeWIB } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import PageHeader from '@/components/PageHeader'
import TimeRangePicker from '@/components/TimeRangePicker'
import WeeklyReport from '@/components/WeeklyReport'
import { useTimeRange } from '@/lib/useTimeRange'
import { rangeQuery } from '@/lib/time-range'

interface Report {
  _id: string
  timestamp: string
  date_label: string
  report_text: string
  raw_rows: number
  ap_count: number
  raw_data: string
}

interface Row {
  ap_name: string
  domain: string
  risk_level: string
  count: number
  client_count: number
}

function parseRows(raw: string): Row[] {
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter(r => r && typeof r.domain === 'string')
      .map(r => ({
        ap_name: String(r.ap_name ?? 'Unknown AP'),
        domain: r.domain,
        risk_level: asRisk(r.risk_level),
        count: Number(r.count) || 0,
        client_count: Number(r.client_count) || 0,
      }))
  } catch {
    return []
  }
}

const num = (n: number) => n.toLocaleString('en-GB')

function DailyView({ query, header }: { query: string; header: React.ReactNode }) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports?${query}`)
      const data = await res.json()
      if (!res.ok || !Array.isArray(data)) throw new Error('bad response')
      setReports(data)
      setFailed(false)
    } catch (error) {
      console.error('Failed to fetch reports:', error)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [query])
  useLoad(load, undefined, query)

  const selected = reports.find(r => r._id === selectedId) ?? reports[0] ?? null
  const previous = selected ? reports[reports.indexOf(selected) + 1] ?? null : null

  const detail = useMemo(() => {
    if (!selected) return null
    const rows = parseRows(selected.raw_data)
    const total = rows.reduce((s, r) => s + r.count, 0)

    const perAp = new Map<string, { queries: number; domains: Set<string>; attention: number }>()
    const perDomain = new Map<string, { queries: number; clients: number; risk: string; aps: Set<string> }>()
    for (const r of rows) {
      const ap = perAp.get(r.ap_name) ?? { queries: 0, domains: new Set<string>(), attention: 0 }
      ap.queries += r.count
      ap.domains.add(r.domain)
      if (r.risk_level !== 'safe') ap.attention += r.count
      perAp.set(r.ap_name, ap)

      const d = perDomain.get(r.domain) ?? { queries: 0, clients: 0, risk: 'safe', aps: new Set<string>() }
      d.queries += r.count
      d.clients = Math.max(d.clients, r.client_count)
      d.aps.add(r.ap_name)
      if (r.risk_level === 'flag' || (r.risk_level === 'watch' && d.risk === 'safe')) d.risk = r.risk_level
      perDomain.set(r.domain, d)
    }

    const aps = [...perAp.entries()].map(([name, v]) => ({ name, ...v, domains: v.domains.size })).sort((a, b) => b.queries - a.queries)
    const domains = [...perDomain.entries()].map(([domain, v]) => ({ domain, ...v, aps: [...v.aps] }))
    return {
      hasRows: rows.length > 0,
      total,
      aps,
      attention: domains.filter(d => d.risk !== 'safe').sort((a, b) => (a.risk === b.risk ? b.queries - a.queries : a.risk === 'flag' ? -1 : 1)),
      top: [...domains].sort((a, b) => b.queries - a.queries).slice(0, 10),
    }
  }, [selected])

  const prevTotal = previous ? previous.raw_rows : 0
  const change = selected && prevTotal > 0 ? Math.round(((selected.raw_rows - prevTotal) / prevTotal) * 100) : null

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div role="status" aria-label="Loading" className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div>
      {header}

      {failed ? (
        <div className="page-x py-12 md:py-20">
          <div className="mx-auto max-w-lg rounded-xl border border-flag-border bg-flag-bg p-6 text-center">
            <p className="font-medium text-flag">Reports could not be loaded</p>
            <p className="text-sm text-chalk-dim mt-1">Check the database connection and try again.</p>
            <button type="button" onClick={load} className="mt-4 px-4 py-2 rounded-lg bg-surface border border-line text-sm font-medium text-chalk">Try again</button>
          </div>
        </div>
      ) : reports.length === 0 || !selected || !detail ? (
        <div className="page-x py-12 md:py-24">
          <div className="mx-auto max-w-lg text-center">
            <span className="mx-auto grid place-items-center w-14 h-14 rounded-full bg-surface-3 text-chalk-dim" aria-hidden="true">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h4" />
              </svg>
            </span>
            <h2 className="mt-5 text-xl font-semibold text-chalk">No daily reports yet</h2>
            <p className="mt-2 text-chalk-dim">
              Reports are written by AI through n8n and archived per day. Once the first report is saved,
              this page shows the summary, a breakdown per access point, and the domains worth reviewing.
            </p>
            <p className="mt-2 text-sm text-chalk-faint">
              In the meantime, you can see today&apos;s network status directly from the live log data.
            </p>
            <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">
              Open live overview
            </Link>
          </div>
        </div>
      ) : (
        <div className="page-x py-5 md:py-8 grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6">
          {/* Pick a date */}
          <nav aria-label="Choose a report" className="no-print min-w-0">
            <label className="lg:hidden block">
              <span className="text-sm text-chalk-dim">Report date</span>
              <select
                value={selected._id}
                onChange={e => setSelectedId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-chalk"
              >
                {reports.map(r => (
                  <option key={r._id} value={r._id}>{r.date_label || formatDateTimeWIB(r.timestamp)}</option>
                ))}
              </select>
            </label>
            <ul className="hidden lg:block space-y-1 lg:sticky lg:top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto">
              {reports.map(r => {
                const active = r._id === selected._id
                return (
                  <li key={r._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r._id)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full text-left rounded-lg px-3 py-2 ${active ? 'bg-primary-light text-primary font-semibold' : 'text-chalk-dim hover:bg-surface-2'}`}
                    >
                      <span className="block text-sm">{r.date_label || formatDateTimeWIB(r.timestamp)}</span>
                      <span className="block text-xs opacity-75 tabular-nums">{num(r.raw_rows)} queries · {r.ap_count} {r.ap_count === 1 ? 'AP' : 'APs'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <article className="min-w-0 space-y-8">
            <header>
              <h2 className="text-xl md:text-2xl font-semibold text-chalk">{selected.date_label || formatDateTimeWIB(selected.timestamp)}</h2>
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="text-xs text-chalk-faint">Total queries</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-chalk">
                    {num(selected.raw_rows)}
                    {change !== null && (
                      <span className={`ml-2 text-sm font-medium ${change > 0 ? 'text-watch' : 'text-safe'}`}>
                        {change > 0 ? '+' : ''}{change}% vs previous report
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-chalk-faint">Access points</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-chalk">{selected.ap_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-chalk-faint">Domains needing attention</dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${detail.attention.length ? 'text-watch' : 'text-chalk'}`}>{detail.attention.length}</dd>
                </div>
              </dl>
            </header>

            <section aria-labelledby="summary-h">
              <h3 id="summary-h" className="text-lg font-semibold text-chalk mb-3">AI summary</h3>
              {selected.report_text.trim() ? (
                <ReportText text={selected.report_text} />
              ) : (
                <p className="text-sm text-chalk-faint">This report has no summary text.</p>
              )}
            </section>

            {!detail.hasRows ? (
              <p className="text-sm text-chalk-faint">Per-AP and per-domain details are not available for this report.</p>
            ) : (
              <>
                <section aria-labelledby="ap-h">
                  <h3 id="ap-h" className="text-lg font-semibold text-chalk mb-3">Per access point</h3>
                  <ul className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
                    {detail.aps.map(ap => (
                      <li key={ap.name} className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <span className="font-medium text-chalk mr-auto">{ap.name}</span>
                          <span className="text-sm tabular-nums text-chalk-dim">{num(ap.queries)} queries · {ap.domains} {ap.domains === 1 ? 'domain' : 'domains'}</span>
                          {ap.attention > 0 && <span className="text-sm tabular-nums text-watch">{num(ap.attention)} need attention</span>}
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                          <div className="h-full bg-primary" style={{ width: `${Math.max(2, (ap.queries / (detail.total || 1)) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                {detail.attention.length > 0 && (
                  <section aria-labelledby="attn-h">
                    <h3 id="attn-h" className="text-lg font-semibold text-chalk mb-3">Domains to review</h3>
                    <div className="rounded-xl border border-line bg-surface overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-2 text-left text-chalk-faint">
                            <th scope="col" className="px-4 py-2 font-medium">Domain</th>
                            <th scope="col" className="px-4 py-2 font-medium">Status</th>
                            <th scope="col" className="px-4 py-2 font-medium text-right">Queries</th>
                            <th scope="col" className="px-4 py-2 font-medium">On AP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {detail.attention.slice(0, 20).map(d => (
                            <tr key={d.domain}>
                              <td className="px-4 py-2.5 font-mono">
                                <Link href={`/dns-intelligence?domain=${encodeURIComponent(d.domain)}`} className="text-chalk underline decoration-line-strong underline-offset-4 hover:decoration-primary break-all">
                                  {d.domain}
                                </Link>
                              </td>
                              <td className="px-4 py-2.5"><RiskBadge level={d.risk} /></td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-chalk-dim">{num(d.queries)}</td>
                              <td className="px-4 py-2.5 text-chalk-dim">{d.aps.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                <section aria-labelledby="top-h">
                  <h3 id="top-h" className="text-lg font-semibold text-chalk mb-3">Most requested domains</h3>
                  <ol className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
                    {detail.top.map(d => (
                      <li key={d.domain} className="flex items-center gap-3 px-4 py-2.5">
                        <Link href={`/dns-intelligence?domain=${encodeURIComponent(d.domain)}`} className="font-mono text-sm text-chalk truncate mr-auto hover:text-primary">
                          {d.domain}
                        </Link>
                        <span className="text-sm tabular-nums text-chalk-dim">{num(d.queries)}×</span>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </article>
        </div>
      )}
    </div>
  )
}

function ReportsInner() {
  const { params, setRange } = useTimeRange()
  const [view, setView] = useState<'daily' | 'weekly'>('daily')
  // Laporan harian: tanpa pilihan di URL, tampilkan 30 hari terakhir (bukan 24 jam)
  const effective = params.range ? params : { range: '30d' }
  const query = rangeQuery(effective)

  const header = (
    <PageHeader
      crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Reports' }]}
      title="Reports"
      description={
        view === 'daily'
          ? 'Daily DNS traffic summaries written by AI every night through the n8n workflow.'
          : 'A real-data summary of one week, compared with the week before.'
      }
      actions={
        <div className="no-print flex flex-wrap items-start justify-end gap-3">
          <div role="group" aria-label="Report type" className="seg">
            <button type="button" className="seg-btn" aria-pressed={view === 'daily'} onClick={() => setView('daily')}>Daily</button>
            <button type="button" className="seg-btn" aria-pressed={view === 'weekly'} onClick={() => setView('weekly')}>Weekly</button>
          </div>
          {view === 'daily' && <TimeRangePicker params={effective} presets={['7d', '30d']} fallback="30d" onChange={setRange} />}
          {view === 'daily' && (
            <a href={`/api/reports/export?${query}`} className="btn" download>
              Export CSV
            </a>
          )}
          <button type="button" className="btn" onClick={() => window.print()} title="Opens the print dialog; choose “Save as PDF” to get a PDF">
            Print / PDF
          </button>
        </div>
      }
    />
  )

  return view === 'daily' ? (
    <DailyView query={query} header={header} />
  ) : (
    <div className="min-h-screen bg-background pb-12">
      {header}
      <div className="page-x py-5 md:py-8">
        <WeeklyReport />
      </div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsInner />
    </Suspense>
  )
}
