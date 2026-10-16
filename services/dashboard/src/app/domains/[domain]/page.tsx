'use client'

import Link from 'next/link'
import { Suspense, use, useCallback, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import TimeRangePicker from '@/components/TimeRangePicker'
import TrendChart from '@/components/charts/TrendChart'
import BlockDomainButton from '@/components/BlockDomain'
import { Card, RecentTable, Stat, nf } from '@/components/DetailParts'
import { useAuth } from '@/contexts/AuthContext'
import { useTimeRange } from '@/lib/useTimeRange'
import { useLoad } from '@/lib/useLoad'
import { formatDateTimeWIB } from '@/lib/format'
import { isMaskedIp } from '@/lib/masked'
import type { SeriesPoint } from '@/lib/overview'

interface DomainDetail {
  domain: string
  bucket_ms: number
  totals: { queries: number; flagged: number; blocked: number; clients: number; first_seen: string | null; last_seen: string | null }
  status: {
    blacklisted: { id: string; type: string; group: string; active: boolean; expires_at: string | null } | null
    allowlisted: boolean
    info: { group: string; type: string } | null
  }
  series: SeriesPoint[]
  clients: { ip: string; raw_hidden: boolean; label: string | null; queries: number; last_seen: string | null }[]
  aps: { ap_ip: string; label: string; queries: number }[]
  recent: { timestamp: string | null; client_ip: string; action: string; enforced?: boolean; risk: string; ap_label: string }[]
}

const chip = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold'

function Inner({ domain }: { domain: string }) {
  const { isAdmin } = useAuth()
  const { params, query, resolved, setRange } = useTimeRange()
  const [data, setData] = useState<DomainDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/domain-detail?domain=${encodeURIComponent(domain)}&${query}`, { cache: 'no-store', credentials: 'same-origin' })
      const body = (await res.json()) as DomainDetail & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Failed to load this domain')
      setData(body)
      setError(null)
      setNow(Date.now())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load this domain')
    }
  }, [domain, query])
  useLoad(load, 60_000, `${domain}|${query}`)

  const st = data?.status
  const clientLink = (ip: string, hidden: boolean) =>
    hidden || isMaskedIp(ip) ? <span className="font-mono text-chalk">{ip}</span> : <Link href={`/clients/${encodeURIComponent(ip)}`} className="font-mono text-primary hover:underline">{ip}</Link>

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'DNS Intelligence', href: '/dns-intelligence' }, { label: domain }]}
        title={domain}
        description={st?.info ? `${st.info.group || 'Uncategorised'}${st.info.type ? ` · ${st.info.type}` : ''}` : undefined}
        actions={
          <div className="flex flex-wrap items-start justify-end gap-3">
            <TimeRangePicker params={params} onChange={setRange} />
            {isAdmin && st && !st.blacklisted && <BlockDomainButton domain={domain} suggestedType={st.info?.type} suggestedGroup={st.info?.group} onBlocked={() => void load()} />}
          </div>
        }
      >
        {st && (
          <div className="mt-4 flex flex-wrap gap-2">
            {st.blacklisted ? (
              <span className={`${chip} ${st.blacklisted.active ? 'border-flag-border bg-flag-bg text-flag' : 'border-line bg-surface-3 text-chalk-dim'}`}>
                {st.blacklisted.active ? 'On the blocklist' : 'On the blocklist (disabled)'}
                {st.blacklisted.expires_at ? ` · until ${formatDateTimeWIB(st.blacklisted.expires_at)}` : ''}
              </span>
            ) : <span className={`${chip} border-line bg-surface-3 text-chalk-dim`}>Not blocked</span>}
            {st.allowlisted && <span className={`${chip} border-safe-border bg-safe-bg text-safe`}>On the allowlist</span>}
          </div>
        )}
      </PageHeader>
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
                <Stat label="Blocked" value={data.totals.blocked} tone="flag" />
                <Stat label="Clients" value={data.totals.clients} />
                <Stat label="Last requested" value={data.totals.last_seen ? formatDateTimeWIB(data.totals.last_seen) : '—'} />
              </dl>
              <Card title={`When · ${resolved.caption}`}>
                {data.totals.queries === 0 ? <p className="text-sm text-chalk-dim">Nobody requested this domain in this period.</p> : (
                  <TrendChart series={data.series} bucketMs={data.bucket_ms} label={`Requests for ${domain}, ${resolved.caption}`} />
                )}
              </Card>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <Card title="Who requested it">
                  {data.clients.length === 0 ? <p className="text-sm text-chalk-dim">None.</p> : (
                    <ul className="space-y-2">
                      {data.clients.map(c => (
                        <li key={c.ip} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0">{clientLink(c.ip, c.raw_hidden)}{c.label && <span className="ml-2 text-xs text-chalk-dim">{c.label}</span>}</span>
                          <span className="text-chalk-dim tabular-nums shrink-0">{nf(c.queries)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="From which access point">
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
                <RecentTable now={now} primaryHeader="Client" rows={data.recent.map(r => ({ ...r, primary: clientLink(r.client_ip, false) }))} />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DomainDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = use(params)
  return (
    <Suspense fallback={null}>
      <Inner domain={decodeURIComponent(domain).toLowerCase()} />
    </Suspense>
  )
}
