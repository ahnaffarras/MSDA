'use client'

import { bucketLabel, type SeriesPoint } from '@/lib/overview'

const W = 640
const H = 200
const PAD = { l: 44, r: 8, t: 10, b: 24 }

/** Batas atas sumbu-Y yang "bulat" (1, 2, 5 × 10^k). */
export function niceMax(v: number): number {
  if (v <= 1) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  const f = v / pow
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow
}

const nf = (n: number) => n.toLocaleString('en-GB')

/**
 * Grafik tren SVG: area = semua query, garis merah = flagged, garis putus = periode sebelumnya.
 * Warna dari token tema (terang/gelap otomatis). Setiap bucket punya <title> untuk tooltip
 * dan pembaca layar.
 */
export default function TrendChart({
  series,
  prev,
  bucketMs,
  label,
}: {
  series: SeriesPoint[]
  prev?: number[]
  bucketMs: number
  label: string
}) {
  const n = series.length
  const max = niceMax(Math.max(1, ...series.map(p => p.queries), ...(prev ?? [])))
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number) => PAD.t + innerH * (1 - v / max)

  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const queries = series.map(p => p.queries)
  const flagged = series.map(p => p.flagged)
  const area = n > 0 ? `${line(queries)} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : ''
  const colW = n > 1 ? innerW / (n - 1) : innerW
  const ticks = [0, max / 2, max]
  const xLabelIdx = n <= 2 ? series.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full h-auto">
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-chalk-faint" fontSize={10}>
            {nf(Math.round(t))}
          </text>
        </g>
      ))}

      {area && <path d={area} className="fill-primary" fillOpacity={0.14} />}
      {prev && prev.length === n && n > 1 && (
        <path d={line(prev)} fill="none" className="stroke-chalk-faint" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      {n > 0 && <path d={line(queries)} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" />}
      {n > 0 && flagged.some(v => v > 0) && (
        <path d={line(flagged)} fill="none" className="stroke-flag" strokeWidth={2} strokeLinejoin="round" />
      )}

      {xLabelIdx.map(i => (
        <text
          key={i}
          x={x(i)}
          y={H - 6}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          className="fill-chalk-faint"
          fontSize={10}
        >
          {bucketLabel(series[i].start, bucketMs)}
        </text>
      ))}

      {/* area sentuh/hover per bucket */}
      {series.map((p, i) => (
        <rect key={p.start} x={x(i) - colW / 2} y={PAD.t} width={colW} height={innerH} fill="transparent">
          <title>
            {`${bucketLabel(p.start, bucketMs)} — ${nf(p.queries)} queries, ${nf(p.flagged)} flagged${prev && prev.length === n ? `, previous period ${nf(prev[i])}` : ''}`}
          </title>
        </rect>
      ))}
    </svg>
  )
}
