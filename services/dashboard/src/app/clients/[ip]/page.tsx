'use client'

import Link from 'next/link'
import { Suspense, use, useCallback, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import TimeRangePicker from '@/components/TimeRangePicker'
import TrendChart from '@/components/charts/TrendChart'
import DeviceModal from '@/components/DeviceModal'
import { Card, RecentTable, Stat, nf } from '@/components/DetailParts'
import { RiskBadge } from '@/components/Risk'
import { useAuth } from '@/contexts/AuthContext'
import { useTimeRange } from '@/lib/useTimeRange'
import { useLoad } from '@/lib/useLoad'
import { formatDateTimeWIB } from '@/lib/format'
import type { ClientDevice } from '@/lib/client-devices'
import type { SeriesPoint } from '@/lib/overview'

interface ClientDetail {
  ip: string
  bucket_ms: number
  device: ClientDevice | null
  totals: { queries: number; flagged: number; domains: number; first_seen: string | null; last_seen: string | null }
  series: SeriesPoint[]
  top_domains: { domain: string; queries: number; type: string; group: string; risk: string }[]
  aps: { ap_ip: string; label: string; queries: number }[]
  recent: { timestamp: string | null; domain: string; action: string; enforced?: boolean; risk: string; ap_label: string }[]
}

function Inner({ ip }: { ip: string }) {
  const { isAdmin } = useAuth()
  const { params, query, resolved, setRange } = useTimeRange()
  const [data, setData] = useState<ClientDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(ip)}?${query}`, { cache: 'no-store', credentials: 'same-origin' })
      const body = (await res.json()) as ClientDetail & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Failed to load this client')
      setData(body)
      setError(null)
      setNow(Date.now())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load this client')
    }
  }, [ip, query])
  useLoad(load, 60_000, `${ip}|${query}`)

  const d = data?.device
  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Clients', href: '/clients' }, { label: ip }]}
        title={d ? d.label : ip}
        description={d ? `${ip}${d.hostname ? ` · ${d.hostname}` : ''}${d.owner ? ` · ${d.owner}` : ''}` : 'This client has no label yet.'}
        actions={
          <div className="flex flex-wrap items-start justify-end gap-3">
            <TimeRangePicker params={params} onChange={setRange} />
            {isAdmin && <button type="button" className="btn" onClick={() => setEditing(true)}>{d ? 'Edit label' : 'Add label'}</button>}
          </div>
        }
      />
      <div className="page-x py-6 md:py-8">
        <div className="w-full max-w-6xl mx-auto space-y-5">
          {error ? (
            <p role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-4 text-sm text-flag">{error}</p>
          ) : !data ? (
            <p className="text-sm text-chalk-dim py-10 text-center">Loading…</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Queries" value={data.totals.queries} />
                <Stat label="Flagged" value={data.totals.flagged} tone="flag" />
                <Stat label="Domains" value={data.totals.domains} />
                <Stat label="Last seen" value={data.totals.last_seen ? formatDateTimeWIB(data.totals.last_seen) : '—'} />
              </dl>
              {d && (d.mac || d.ip_history.length > 0 || d.note) && (
                <Card title="Device">
                  <dl className="text-sm grid sm:grid-cols-2 gap-2 text-chalk-dim">
                    {d.mac && <div><dt className="inline text-chalk-faint">MAC: </dt><dd className="inline font-mono text-chalk">{d.mac}</dd></div>}
                    {d.note && <div><dt className="inline text-chalk-faint">Note: </dt><dd className="inline text-chalk">{d.note}</dd></div>}
                    {d.ip_history.length > 0 && (
                      <div className="sm:col-span-2"><dt className="inline text-chalk-faint">Earlier IPs: </dt><dd className="inline font-mono text-chalk">{d.ip_history.map(h => h.ip).join(', ')}</dd></div>
                    )}
                  </dl>
                </Card>
              )}
              <Card title={`Activity · ${resolved.caption}`}>
                {data.totals.queries === 0 ? <p className="text-sm text-chalk-dim">No DNS activity from this client in this period.</p> : (
                  <TrendChart series={data.series} bucketMs={data.bucket_ms} label={`DNS queries from ${ip}, ${resolved.caption}`} />
                )}
              </Card>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <Card title="Top domains">
                  {data.top_domains.length === 0 ? <p className="text-sm text-chalk-dim">None.</p> : (
                    <ul className="space-y-2">
                      {data.top_domains.map(t => (
                        <li key={t.domain} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 min-w-0"><RiskBadge level={t.risk} compact /><Link href={`/domains/${encodeURIComponent(t.domain)}`} className="font-mono text-primary hover:underline break-all">{t.domain}</Link></span>
                          <span className="text-chalk-dim tabular-nums shrink-0">{nf(t.queries)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Access points used">
                  {data.aps.length === 0 ? <p className="text-sm text-chalk-dim">None.</p> : (
                    <ul className="space-y-2">
                      {data.aps.map(a => (
                        <li key={a.ap_ip} className="flex items-center justify-between gap-3 text-sm"><span className="text-chalk">{a.label}<span className="ml-2 font-mono text-xs text-chalk-faint">{a.ap_ip}</span></span><span className="text-chalk-dim tabular-nums">{nf(a.queries)}</span></li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <Card title="Latest requests">
                <RecentTable
                  now={now}
                  primaryHeader="Domain"
                  rows={data.recent.map(r => ({ ...r, primary: <Link href={`/domains/${encodeURIComponent(r.domain)}`} className="font-mono text-primary hover:underline">{r.domain}</Link> }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
      {editing && <DeviceModal initial={{ ip, label: d?.label ?? '', mac: d?.mac, hostname: d?.hostname, owner: d?.owner, note: d?.note }} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load() }} />}
    </div>
  )
}

export default function ClientDetailPage({ params }: { params: Promise<{ ip: string }> }) {
  const { ip } = use(params)
  return (
    <Suspense fallback={null}>
      <Inner ip={decodeURIComponent(ip)} />
    </Suspense>
  )
}
