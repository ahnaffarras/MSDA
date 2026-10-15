'use client'

import { useCallback, useState } from 'react'
import TrendChart from '@/components/charts/TrendChart'
import Heatmap from '@/components/charts/Heatmap'
import TimeRangePicker from '@/components/TimeRangePicker'
import { useTimeRange } from '@/lib/useTimeRange'
import { useLoad } from '@/lib/useLoad'
import type { TrendsData } from '@/lib/trends'

const nf = (n: number) => n.toLocaleString('en-GB')

function Delta({ value, goodWhenDown }: { value: number | null; goodWhenDown?: boolean }) {
  if (value === null) return <span className="text-xs text-chalk-faint">no earlier data</span>
  if (value === 0) return <span className="text-xs text-chalk-faint">no change</span>
  const up = value > 0
  const bad = goodWhenDown ? up : false
  return (
    <span className={`text-xs font-medium ${bad ? 'text-flag' : 'text-chalk-dim'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span> {Math.abs(value)}% vs previous period
    </span>
  )
}

/**
 * Panel tren + heatmap (C2). Memakai rentang global dari URL. `apIps` membatasi ke satu
 * kelompok AP (mis. satu jaringan). `showPicker=false` bila halaman sudah punya pemilih rentang.
 */
export default function TrendsPanel({
  apIps,
  title = 'Traffic over time',
  showPicker = true,
  showChart = true,
}: {
  apIps?: string[]
  title?: string
  showPicker?: boolean
  showChart?: boolean
}) {
  const { params, query, resolved, setRange } = useTimeRange()
  const [data, setData] = useState<TrendsData | null>(null)
  const [error, setError] = useState(false)
  const apKey = (apIps ?? []).join(',')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trends?${query}${apKey ? `&ap_ip=${encodeURIComponent(apKey)}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setData((await res.json()) as TrendsData)
      setError(false)
    } catch {
      setError(true)
    }
  }, [query, apKey])
  useLoad(load, 60_000, `${query}|${apKey}`)

  const empty = data !== null && data.totals.queries === 0
  const noAps = apIps !== undefined && apIps.length === 0

  return (
    <section className="rounded-xl border border-line bg-surface p-5 space-y-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-chalk">{title}</h2>
          <p className="text-xs text-chalk-faint mt-0.5">{resolved.caption} · times in WIB</p>
        </div>
        {showPicker && <TimeRangePicker params={params} onChange={setRange} />}
      </div>

      {noAps ? (
        <p className="text-sm text-chalk-dim">No access points are assigned to this network yet.</p>
      ) : error && !data ? (
        <p role="alert" className="text-sm text-flag">Could not load the trends. It will retry automatically.</p>
      ) : !data ? (
        <p className="text-sm text-chalk-dim py-6 text-center">Loading…</p>
      ) : empty ? (
        <p className="text-sm text-chalk-dim py-6 text-center">No DNS traffic in this period.</p>
      ) : (
        <>
          {showChart && (
            <>
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="text-xs text-chalk-faint">Queries</dt>
                  <dd className="text-2xl font-semibold text-chalk tabular-nums">{nf(data.totals.queries)}</dd>
                  <Delta value={data.delta.queries} />
                </div>
                <div>
                  <dt className="text-xs text-chalk-faint">Flagged</dt>
                  <dd className="text-2xl font-semibold text-flag tabular-nums">{nf(data.totals.flagged)}</dd>
                  <Delta value={data.delta.flagged} goodWhenDown />
                </div>
              </dl>
              <div>
                <TrendChart series={data.series} prev={data.prev_queries} bucketMs={data.bucket_ms} label={`DNS queries over time, ${resolved.caption}`} />
                <p className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-chalk-faint">
                  <span><span className="inline-block w-3 h-0.5 bg-primary align-middle mr-1" />All queries</span>
                  <span><span className="inline-block w-3 h-0.5 bg-flag align-middle mr-1" />Flagged</span>
                  <span><span className="inline-block w-3 border-t border-dashed border-chalk-faint align-middle mr-1" />Previous period</span>
                </p>
              </div>
            </>
          )}
          <div>
            {showChart && <h3 className="text-sm font-medium text-chalk mb-1">Busiest hours</h3>}
            <p className="text-xs text-chalk-faint mb-2">Queries by weekday and hour (WIB). A week or more gives the clearest pattern.</p>
            <Heatmap heatmap={data.heatmap} label={`Heatmap of DNS queries by weekday and hour, ${resolved.caption}`} />
          </div>
        </>
      )}
    </section>
  )
}
