'use client'

import { WEEKDAYS, type Heatmap as HeatmapData } from '@/lib/trends'

const CELL_W = 22
const CELL_H = 20
const LEFT = 34
const TOP = 16

const nf = (n: number) => n.toLocaleString('en-GB')

/** Heatmap jam × hari (WIB). Makin pekat = makin banyak query; kosong = abu-abu. */
export default function Heatmap({ heatmap, label }: { heatmap: HeatmapData; label: string }) {
  const { cells, max } = heatmap
  const width = LEFT + 24 * CELL_W
  const height = TOP + 7 * CELL_H

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="w-full min-w-[34rem] h-auto">
        {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
          <text key={h} x={LEFT + h * CELL_W + CELL_W / 2} y={10} textAnchor="middle" className="fill-chalk-faint" fontSize={9}>
            {String(h).padStart(2, '0')}
          </text>
        ))}
        {cells.map((row, d) => (
          <g key={WEEKDAYS[d]}>
            <text x={LEFT - 6} y={TOP + d * CELL_H + CELL_H / 2 + 3} textAnchor="end" className="fill-chalk-dim" fontSize={10}>
              {WEEKDAYS[d]}
            </text>
            {row.map((v, h) => (
              <rect
                key={h}
                x={LEFT + h * CELL_W + 1}
                y={TOP + d * CELL_H + 1}
                width={CELL_W - 2}
                height={CELL_H - 2}
                rx={3}
                className={v > 0 ? 'fill-primary' : 'fill-surface-3'}
                fillOpacity={v > 0 && max > 0 ? 0.18 + 0.82 * (v / max) : 1}
              >
                <title>{`${WEEKDAYS[d]} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 WIB — ${nf(v)} queries`}</title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
