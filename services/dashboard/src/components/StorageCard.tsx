'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { formatDateTimeWIB, timeAgo } from '@/lib/format'
import { formatBytes, type StorageSummary, type Tone } from '@/lib/storage-config'
import { useLoad } from '@/lib/useLoad'

const REFRESH_MS = 60_000
/** Scheduler dianggap mati bila heartbeat lebih lama dari ini. */
const HEARTBEAT_STALE_MS = 3 * 60_000
const nf = (n: number) => n.toLocaleString('en-GB')

const TONE_TEXT: Record<Tone, string> = {
  safe: 'Disk space is fine',
  watch: 'Disk is getting full',
  flag: 'Disk is almost full',
  idle: 'Disk usage not reported',
}

/**
 * Ringkasan penyimpanan untuk halaman Dashboard: ukuran database, pemakaian disk,
 * koleksi terbesar, dan status pembersihan otomatis. Tautan "Manage" membuka halaman
 * Storage & cleanup. Kartu ini mengambil datanya sendiri dan tidak pernah merusak
 * halaman induk bila gagal.
 */
export default function StorageCard() {
  const [data, setData] = useState<StorageSummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/storage/summary')
      if (!res.ok) throw new Error('summary failed')
      setData((await res.json()) as StorageSummary)
      setFailed(false)
      setNow(Date.now())
    } catch (error) {
      console.error('Failed to load storage summary:', error)
      setFailed(true)
    }
  }, [])
  useLoad(load, REFRESH_MS)

  const shell = (children: React.ReactNode, tone: Tone = 'idle') => (
    <section
      className={`chalk-surface rounded-xl border border-line bg-surface min-w-0 ${
        tone === 'flag' ? 'border-t-2 border-t-flag' : tone === 'watch' ? 'border-t-2 border-t-watch' : ''
      }`}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 md:px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-chalk">Storage</h2>
          <p className="text-xs text-chalk-faint mt-0.5">Database size and automatic cleanup</p>
        </div>
        <Link href="/storage" className="text-sm font-medium text-primary underline underline-offset-4 whitespace-nowrap">
          Manage
        </Link>
      </header>
      {children}
    </section>
  )

  if (!data || now === null) {
    return shell(
      <p className="px-4 md:px-5 pb-4 text-sm text-chalk-faint">
        {failed ? 'Storage information is not available right now.' : 'Loading storage information…'}
      </p>,
    )
  }

  const heartbeatAgo = data.schedulerHeartbeatAt ? now - new Date(data.schedulerHeartbeatAt).getTime() : null
  const schedulerDown = heartbeatAgo === null || heartbeatAgo > HEARTBEAT_STALE_MS
  const pct = data.db.fsPercent
  const barColor = `var(--accent-${data.tone === 'idle' ? 'safe' : data.tone})`
  const autoOff = data.autoEnabled === 0

  return shell(
    <div className="border-t border-line">
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line">
        <div className="bg-surface px-4 md:px-5 py-4 min-w-0">
          <dt className="text-xs font-medium text-chalk-faint">Database size</dt>
          <dd className="mt-1.5 font-mono text-[1.5rem] leading-none font-medium tnum text-chalk">{formatBytes(data.db.totalBytes)}</dd>
          <dd className="mt-2 text-xs text-chalk-faint">{nf(data.db.objects)} documents · {nf(data.db.collections)} collections</dd>
        </div>

        <div className="bg-surface px-4 md:px-5 py-4 min-w-0">
          <dt className="text-xs font-medium text-chalk-faint">Disk used</dt>
          <dd
            className={`mt-1.5 font-mono text-[1.5rem] leading-none font-medium tnum ${
              data.tone === 'flag' ? 'text-flag' : data.tone === 'watch' ? 'text-watch' : 'text-chalk'
            }`}
          >
            {pct === null ? 'n/a' : `${pct}%`}
          </dd>
          <dd className="mt-2 text-xs text-chalk-faint">
            {pct === null
              ? TONE_TEXT.idle
              : `${formatBytes(data.db.fsUsedBytes)} of ${formatBytes(data.db.fsTotalBytes)} · ${TONE_TEXT[data.tone].toLowerCase()}`}
          </dd>
          {pct !== null && (
            <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, pct))}%`, backgroundColor: barColor }} />
            </div>
          )}
        </div>

        <div className="bg-surface px-4 md:px-5 py-4 min-w-0">
          <dt className="text-xs font-medium text-chalk-faint">Largest collection</dt>
          <dd className="mt-1.5 text-lg leading-tight font-semibold text-chalk truncate" title={data.largest?.name}>
            {data.largest ? data.largest.label : '-'}
          </dd>
          <dd className="mt-2 text-xs text-chalk-faint">{data.largest ? formatBytes(data.largest.totalBytes) : 'no data yet'}</dd>
        </div>

        <div className="bg-surface px-4 md:px-5 py-4 min-w-0">
          <dt className="text-xs font-medium text-chalk-faint">Automatic cleanup</dt>
          <dd className={`mt-1.5 text-lg leading-tight font-semibold ${autoOff ? 'text-watch' : 'text-chalk'}`}>
            {autoOff ? 'Off' : `${data.autoEnabled} of ${data.autoTotal} on`}
          </dd>
          <dd className="mt-2 text-xs text-chalk-faint">
            {autoOff
              ? 'Old data is kept forever'
              : data.nextCleanupAt
                ? `Next run ${formatDateTimeWIB(data.nextCleanupAt)} WIB`
                : 'No run scheduled'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-4 md:px-5 py-2.5 text-xs text-chalk-faint">
        <span>
          {data.lastCleanup
            ? `Last cleanup ${timeAgo(data.lastCleanup.at, now)} · ${nf(data.lastCleanup.deleted)} deleted (${data.lastCleanup.mode})`
            : 'No cleanup has run yet'}
        </span>
        <span>Size recorded every {data.snapshotIntervalMin >= 60 ? `${data.snapshotIntervalMin / 60} h` : `${data.snapshotIntervalMin} min`}</span>
        {schedulerDown && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-watch-border bg-watch-bg px-2.5 py-0.5 font-medium text-watch">
            Scheduler not running — automatic cleanup is paused
          </span>
        )}
      </div>
    </div>,
    data.tone,
  )
}
