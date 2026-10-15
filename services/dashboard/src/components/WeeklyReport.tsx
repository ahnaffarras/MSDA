'use client'

import { useCallback, useState } from 'react'
import TrendChart from '@/components/charts/TrendChart'
import { RiskBadge } from '@/components/Risk'
import { useLoad } from '@/lib/useLoad'
import type { OverviewData } from '@/lib/overview'
import type { TrendsData } from '@/lib/trends'
import { WIB_OFFSET, startOfWibDay, toWibYmd } from '@/lib/time-range'

const DAY = 86_400_000
const nf = (n: number) => n.toLocaleString('en-GB')

/** Senin 00:00 WIB dari minggu yang memuat `ms`. */
function mondayOf(ms: number): number {
  const day = startOfWibDay(ms)
  const dow = new Date(day + WIB_OFFSET).getUTCDay() // 0 = Minggu
  return day - ((dow + 6) % 7) * DAY
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })

function Delta({ value, upIsBad }: { value: number | null; upIsBad?: boolean }) {
  if (value === null) return <span className="text-xs text-chalk-faint">no earlier week to compare</span>
  if (value === 0) return <span className="text-xs text-chalk-faint">same as the week before</span>
  const up = value > 0
  return (
    <span className={`text-xs font-medium ${upIsBad && up ? 'text-flag' : 'text-chalk-dim'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span> {Math.abs(value)}% vs the week before
    </span>
  )
}

/**
 * Laporan mingguan (C6): data nyata dari agregasi (bukan teks AI). Pilih minggu (Senin–Minggu, WIB);
 * dibandingkan dengan periode sama panjang tepat sebelumnya. Minggu berjalan = "so far".
 */
export default function WeeklyReport() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(Date.now()))
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [error, setError] = useState(false)
  const [nowMs] = useState(() => Date.now())

  const weekEnd = weekStart + 6 * DAY // Minggu (hari terakhir)
  const query = `range=custom&from=${toWibYmd(weekStart)}&to=${toWibYmd(weekEnd)}`
  const isCurrent = weekStart === mondayOf(nowMs)

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([fetch(`/api/overview?${query}`, { cache: 'no-store' }), fetch(`/api/trends?${query}`, { cache: 'no-store' })])
      if (!o.ok || !t.ok) throw new Error('bad response')
      setOverview((await o.json()) as OverviewData)
      setTrends((await t.json()) as TrendsData)
      setError(false)
    } catch {
      setError(true)
    }
  }, [query])
  useLoad(load, 120_000, query)

  const label = `${fmt(weekStart)} – ${fmt(weekEnd)}`

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-chalk">Week of {label}</h2>
          <p className="text-xs text-chalk-faint mt-0.5">
            Monday to Sunday, WIB.{isCurrent ? ' This week is still in progress, so figures are “so far”.' : ''}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <button type="button" className="btn" onClick={() => { setOverview(null); setTrends(null); setWeekStart(w => w - 7 * DAY) }}>
            ← Previous week
          </button>
          <button type="button" className="btn" disabled={isCurrent} onClick={() => { setOverview(null); setTrends(null); setWeekStart(w => w + 7 * DAY) }}>
            Next week →
          </button>
        </div>
      </header>

      {error && !overview ? (
        <p role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-4 text-sm text-flag">Could not load this week. It will retry automatically.</p>
      ) : !overview || !trends ? (
        <p className="text-sm text-chalk-dim py-10 text-center">Loading…</p>
      ) : overview.totals.queries === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-chalk-dim">No DNS traffic was recorded in this week.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'Queries', v: overview.totals.queries, d: trends.delta.queries, bad: false },
              { k: 'Flagged', v: trends.totals.flagged, d: trends.delta.flagged, bad: true },
              { k: 'Clients', v: overview.totals.clients, d: null as number | null, bad: false },
              { k: 'Domains', v: overview.totals.domains, d: null as number | null, bad: false },
            ].map(s => (
              <div key={s.k} className="rounded-lg border border-line bg-surface-2 p-4">
                <dt className="text-xs text-chalk-faint">{s.k}</dt>
                <dd className={`text-2xl font-semibold tabular-nums ${s.k === 'Flagged' ? 'text-flag' : 'text-chalk'}`}>{nf(s.v)}</dd>
                {s.d !== null || s.k === 'Queries' || s.k === 'Flagged' ? <Delta value={s.d} upIsBad={s.bad} /> : null}
              </div>
            ))}
          </dl>

          <section aria-label="Daily traffic this week" className="rounded-xl border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold text-chalk mb-2">Queries per day</h3>
            <TrendChart series={trends.series} prev={trends.prev_queries} bucketMs={trends.bucket_ms} label={`DNS queries per day, week of ${label}`} />
            <p className="mt-1 text-[11px] text-chalk-faint">Dashed line = the week before.</p>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-chalk mb-3">Most requested domains</h3>
              <ol className="space-y-2">
                {overview.top_domains.map(d => (
                  <li key={d.domain} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-mono text-chalk break-all">{d.domain}</span>
                    <span className="text-chalk-dim tabular-nums shrink-0">{nf(d.queries)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-chalk mb-3">Domains worth reviewing</h3>
              {overview.attention.length === 0 ? (
                <p className="text-sm text-chalk-dim">Nothing risky this week.</p>
              ) : (
                <ul className="space-y-2">
                  {overview.attention.map(d => (
                    <li key={d.domain} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <RiskBadge level={d.risk} />
                        <span className="font-mono text-chalk break-all">{d.domain}</span>
                      </span>
                      <span className="text-chalk-dim tabular-nums shrink-0">{nf(d.queries)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </article>
  )
}
