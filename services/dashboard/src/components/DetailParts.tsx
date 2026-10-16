'use client'

import { RiskBadge } from '@/components/Risk'
import { timeAgo } from '@/lib/format'
import { formatDateTimeWIB } from '@/lib/format'
import { actionLabel } from '@/lib/labels'

export const nf = (n: number) => n.toLocaleString('en-GB')

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'flag' }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <dt className="text-xs text-chalk-faint">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone === 'flag' ? 'text-flag' : 'text-chalk'}`}>{typeof value === 'number' ? nf(value) : value}</dd>
    </div>
  )
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-chalk mb-3">{title}</h2>
      {children}
    </section>
  )
}

export interface RecentRow {
  timestamp: string | null
  risk: string
  action: string
  /** true = benar-benar diblokir di DNS (bukan sekadar cocok blocklist) */
  enforced?: boolean
  ap_label: string
  primary: React.ReactNode
}

/** Tabel kejadian terbaru (timeline akses). */
export function RecentTable({ rows, primaryHeader, now }: { rows: RecentRow[]; primaryHeader: string; now: number }) {
  if (rows.length === 0) return <p className="text-sm text-chalk-dim">No activity in this period.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-chalk-faint border-b border-line">
            <th className="py-2 pr-4">Time (WIB)</th><th className="py-2 pr-4">{primaryHeader}</th><th className="py-2 pr-4">Risk</th><th className="py-2 pr-4">Result</th><th className="py-2">AP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap text-chalk" title={r.timestamp ? timeAgo(r.timestamp, now) : ''}>{r.timestamp ? formatDateTimeWIB(r.timestamp) : '—'}</td>
              <td className="py-2 pr-4 break-all">{r.primary}</td>
              <td className="py-2 pr-4"><RiskBadge level={r.risk} compact /></td>
              <td className="py-2 pr-4 text-chalk-dim">{actionLabel(r.action, r.enforced)}</td>
              <td className="py-2 text-xs text-chalk-dim">{r.ap_label || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
