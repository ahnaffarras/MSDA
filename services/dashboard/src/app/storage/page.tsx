'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader, { Segmented } from '@/components/PageHeader'
import { adminFetch } from '@/lib/admin-client'
import { useAuth } from '@/contexts/AuthContext'
import { formatDateTimeWIB, timeAgo } from '@/lib/format'
import {
  SNAPSHOT_INTERVALS,
  formatBytes,
  snapshotIntervalLabel,
  type CleanupLogEntry,
  type CleanupPreview,
  type CleanupResult,
  type CollectionPolicy,
  type CollectionRole,
  type CollectionStat,
  type GlobalSettings,
  type PolicyView,
  type RunStatus,
  type SnapshotPoint,
  type StorageOverview,
  type Tone,
} from '@/lib/storage-config'
import { diskTone } from '@/lib/storage-config'
import { useLoad } from '@/lib/useLoad'

const nf = (n: number) => n.toLocaleString('en-GB')
/** Scheduler dianggap mati bila heartbeat lebih lama dari ini. */
const HEARTBEAT_STALE_MS = 3 * 60_000

const REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '1m' },
  { value: 300_000, label: '5m' },
  { value: 900_000, label: '15m' },
]
const RANGE_OPTIONS = [
  { value: 24, label: '24h' },
  { value: 168, label: '7d' },
  { value: 720, label: '30d' },
  { value: 2160, label: '90d' },
]

const ROLE_LABEL: Record<CollectionRole, string> = {
  cleanable: 'Cleanable',
  protected: 'Protected',
  internal: 'Internal',
  unmanaged: 'Other',
}

type Edits = Record<string, Partial<CollectionPolicy>>

/* ───────────────────────────── bagian kecil ───────────────────────────── */

function Panel({
  title,
  caption,
  action,
  className = '',
  children,
}: {
  title: string
  caption?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`chalk-surface flex flex-col rounded-xl border border-line bg-surface min-w-0 ${className}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-4 md:px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-chalk">{title}</h2>
          {caption && <p className="text-xs text-chalk-faint mt-0.5">{caption}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function Note({ tone, children }: { tone: 'watch' | 'flag' | 'safe'; children: React.ReactNode }) {
  const cls =
    tone === 'flag'
      ? 'border-flag-border bg-flag-bg text-flag'
      : tone === 'watch'
        ? 'border-watch-border bg-watch-bg text-watch'
        : 'border-safe-border bg-safe-bg text-safe'
  return (
    <p role={tone === 'flag' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {children}
    </p>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 flex-shrink-0 items-center rounded-full border transition-colors ${
        checked ? 'bg-primary border-primary' : 'bg-surface-3 border-line-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[1.1rem]' : 'translate-x-1'}`}
      />
    </button>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (v: number) => void
}) {
  const invalid = Number.isNaN(value) || !Number.isInteger(value) || value < min || value > max
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-chalk-dim">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isNaN(value) ? '' : value}
          onChange={e => onChange(e.target.valueAsNumber)}
          aria-invalid={invalid}
          className={`w-24 rounded-lg border bg-surface-2 px-3 py-1.5 font-mono text-sm text-chalk tnum ${
            invalid ? 'border-flag-border' : 'border-line'
          }`}
        />
        {suffix && <span className="text-sm text-chalk-faint">{suffix}</span>}
      </span>
      {invalid && <span className="mt-1 block text-xs text-flag">Whole number, {min}–{max}</span>}
    </label>
  )
}

function StatusDot({ status }: { status: RunStatus | null }) {
  const color =
    status === 'ok' ? 'var(--accent-safe)' : status === 'partial' || status === 'skipped' ? 'var(--accent-watch)' : status === 'error' ? 'var(--accent-flag)' : 'var(--line-strong)'
  return <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
}

/* ───────────────────────────── grafik ukuran ───────────────────────────── */

function SizeChart({ points, hours }: { points: SnapshotPoint[]; hours: number }) {
  const W = 720
  const H = 220
  const L = 62
  const R = 12
  const T = 12
  const B = 26
  const values = points.map(p => p.totalBytes)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = Math.max((rawMax - rawMin) * 0.15, rawMax * 0.01, 1)
  const min = Math.max(0, rawMin - pad)
  const max = rawMax + pad
  const t0 = new Date(points[0].at).getTime()
  const t1 = new Date(points[points.length - 1].at).getTime()
  const span = Math.max(1, t1 - t0)
  const x = (t: number) => L + ((t - t0) / span) * (W - L - R)
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(new Date(p.at).getTime()).toFixed(1)},${y(p.totalBytes).toFixed(1)}`).join(' ')
  const area = `${line} L${x(t1).toFixed(1)},${H - B} L${x(t0).toFixed(1)},${H - B} Z`
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Jakarta',
      ...(hours <= 48 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { day: 'numeric', month: 'short' }),
    })
  const ticks = [0, 0.5, 1].map(f => min + (max - min) * f)
  const last = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Database size over time, now ${formatBytes(last.totalBytes)}`}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="4 4" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--chalk-faint)" fontFamily="var(--font-mono)">
            {formatBytes(v)}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--primary)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(t1)} cy={y(last.totalBytes)} r="3.5" fill="var(--primary)" />
      {points.map(p => (
        <circle key={p.at} cx={x(new Date(p.at).getTime())} cy={y(p.totalBytes)} r="7" fill="transparent">
          <title>{`${fmt(p.at)} — ${formatBytes(p.totalBytes)}`}</title>
        </circle>
      ))}
      <text x={L} y={H - 6} fontSize="11" fill="var(--chalk-faint)">{fmt(points[0].at)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fontSize="11" fill="var(--chalk-faint)">{fmt(last.at)}</text>
    </svg>
  )
}

/* ───────────────────────────── dialog ───────────────────────────── */

function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center p-0 sm:p-4" role="presentation">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgb(0 0 0 / 0.55)' }} onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-line bg-surface p-5 shadow-2xl max-h-[90dvh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold text-chalk">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const FORBIDDEN = 'Only administrators can do this.'

function CleanDialog({
  policy,
  retentionDays,
  onClose,
  onChanged,
}: {
  policy: PolicyView
  retentionDays: number
  onClose: () => void
  onChanged: () => void
}) {
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setConfirm('')
    try {
      const res = await adminFetch('/api/storage/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'preview', collection: policy.name, retentionDays }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Could not preview the cleanup.')
      setPreview(data as CleanupPreview)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not preview the cleanup.')
    } finally {
      setLoading(false)
    }
  }, [policy.name, retentionDays])
  useLoad(loadPreview)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await adminFetch('/api/storage/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'run', collection: policy.name, retentionDays, confirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) throw new Error(FORBIDDEN)
      if (!res.ok) throw new Error(data?.error ?? 'The cleanup failed.')
      setResult(data as CleanupResult)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The cleanup failed.')
    } finally {
      setRunning(false)
    }
  }

  const cutoffLabel = preview ? formatDateTimeWIB(preview.cutoff) : ''
  const nothing = preview !== null && preview.matched === 0
  const canRun = preview !== null && !preview.blocked && !nothing && confirm === policy.name && !running

  return (
    <Modal title={`Clean ${policy.label}`} onClose={onClose} busy={running}>
      <p className="mt-1 font-mono text-sm text-chalk-dim">{policy.name}</p>

      {result ? (
        <div className="mt-4 space-y-3">
          <Note tone={result.status === 'ok' ? 'safe' : result.status === 'error' ? 'flag' : 'watch'}>{result.message}</Note>
          <p className="text-xs text-chalk-faint">
            Took {(result.durationMs / 1000).toFixed(1)} s. Deleting documents makes room that MongoDB reuses; to give disk space back to the
            server, use “Reclaim disk space”.
          </p>
          <div className="flex justify-end gap-2">
            {result.status === 'partial' && (
              <button type="button" className="btn" onClick={() => void loadPreview()}>
                Check again
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-chalk-dim">
            Deletes records older than <strong className="text-chalk">{retentionDays} days</strong>
            {preview ? <> (before {cutoffLabel} WIB)</> : null}. Newer records and every other collection are not touched.
          </p>

          {loading && <p className="mt-4 text-sm text-chalk-faint">Counting what would be deleted…</p>}

          {preview && !loading && (
            <div className="mt-4 space-y-3">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-sm">
                <div className="bg-surface px-3 py-2.5">
                  <dt className="text-xs text-chalk-faint">Will be deleted</dt>
                  <dd className="font-mono tnum text-chalk">{preview.matched === null ? 'a lot (too many to count quickly)' : nf(preview.matched)}</dd>
                </div>
                <div className="bg-surface px-3 py-2.5">
                  <dt className="text-xs text-chalk-faint">In the collection now</dt>
                  <dd className="font-mono tnum text-chalk">{preview.total === null ? '-' : nf(preview.total)}</dd>
                </div>
              </dl>
              {policy.caution && <Note tone="watch">{policy.caution}</Note>}
              {preview.blocked && <Note tone="flag">{preview.blocked}</Note>}
              {nothing && !preview.blocked && <Note tone="safe">Nothing is older than {retentionDays} days. There is nothing to delete.</Note>}

              {!preview.blocked && !nothing && (
                <label className="block">
                  <span className="text-sm font-medium text-chalk">
                    Type <span className="font-mono">{policy.name}</span> to confirm
                  </span>
                  <input
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-chalk"
                  />
                </label>
              )}
            </div>
          )}

          {error && <p role="alert" className="mt-3 rounded-lg border border-flag-border bg-flag-bg px-3 py-2 text-sm text-flag">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={running} className="px-4 py-2 rounded-lg text-sm font-medium text-chalk-dim hover:bg-surface-2">
              {nothing || preview?.blocked ? 'Close' : 'Cancel'}
            </button>
            {preview && !preview.blocked && !nothing && (
              <button
                type="button"
                onClick={run}
                disabled={!canRun}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-flag text-background disabled:opacity-40"
              >
                {running ? 'Deleting…' : `Delete ${preview.matched === null ? 'old records' : `${nf(preview.matched)} records`}`}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

function CompactDialog({
  name,
  label,
  onClose,
  onChanged,
}: {
  name: string
  label: string
  onClose: () => void
  onChanged: () => void
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await adminFetch('/api/storage/actions', { method: 'POST', body: JSON.stringify({ action: 'compact', collection: name }) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) throw new Error(FORBIDDEN)
      if (!res.ok) throw new Error(data?.error ?? 'Compaction failed.')
      setResult(data as CleanupResult)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compaction failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal title={`Reclaim disk space — ${label}`} onClose={onClose} busy={running}>
      <p className="mt-1 font-mono text-sm text-chalk-dim">{name}</p>
      {result ? (
        <div className="mt-4 space-y-3">
          <Note tone={result.status === 'ok' ? 'safe' : 'flag'}>{result.message}</Note>
          {result.beforeBytes != null && result.afterBytes != null && (
            <p className="text-sm text-chalk-dim">
              {formatBytes(result.beforeBytes)} → {formatBytes(result.afterBytes)}
            </p>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-chalk-dim">
            After old records are deleted, MongoDB keeps the freed space inside its file and reuses it for new data, so the disk usage number
            does not drop by itself. Compacting hands that space back to the server.
          </p>
          <p className="mt-2 text-sm text-chalk-dim">
            <strong className="text-chalk">No data is deleted.</strong> It can slow this collection down while it runs, so do it when traffic is low.
          </p>
          {error && <p role="alert" className="mt-3 rounded-lg border border-flag-border bg-flag-bg px-3 py-2 text-sm text-flag">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={running} className="px-4 py-2 rounded-lg text-sm font-medium text-chalk-dim hover:bg-surface-2">
              Cancel
            </button>
            <button type="button" onClick={run} disabled={running} className="btn btn-primary">
              {running ? 'Working…' : 'Reclaim space'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ───────────────────────────── halaman ───────────────────────────── */

type Dialog = { kind: 'clean' | 'compact'; name: string } | null

function Skeleton() {
  const b = 'rounded-xl bg-surface-3 animate-pulse'
  return (
    <div aria-hidden="true">
      <div className="page-head">
        <div className="page-x py-7 space-y-3">
          <div className="h-9 w-72 rounded bg-surface-3 animate-pulse" />
          <div className="h-4 w-full max-w-md rounded bg-surface-3 animate-pulse" />
        </div>
      </div>
      <div className="page-x py-6 space-y-4">
        <div className={`${b} h-28`} />
        <div className={`${b} h-64`} />
        <div className={`${b} h-64`} />
      </div>
    </div>
  )
}

export default function StoragePage() {
  const [overview, setOverview] = useState<StorageOverview | null>(null)
  const [points, setPoints] = useState<SnapshotPoint[]>([])
  const [logs, setLogs] = useState<CleanupLogEntry[]>([])
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const [refreshMs, setRefreshMs] = useState(60_000)
  const [rangeHours, setRangeHours] = useState(168)

  const [edits, setEdits] = useState<Edits>({})
  const [globalEdits, setGlobalEdits] = useState<Partial<GlobalSettings>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'safe' | 'flag'; text: string } | null>(null)
  const { isAdmin, loading: authLoading } = useAuth()
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = useCallback(async () => {
    try {
      setRefreshing(true)
      const [oRes, hRes] = await Promise.all([fetch('/api/storage'), fetch(`/api/storage/history?hours=${rangeHours}&logs=30`)])
      if (!oRes.ok) throw new Error('storage failed')
      setOverview((await oRes.json()) as StorageOverview)
      if (hRes.ok) {
        const h = await hRes.json()
        setPoints(Array.isArray(h.points) ? h.points : [])
        setLogs(Array.isArray(h.logs) ? h.logs : [])
      }
      setFailed(false)
      setNow(Date.now())
    } catch (error) {
      console.error('Failed to load storage page:', error)
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
  }, [rangeHours])
  useLoad(load, refreshMs || undefined, rangeHours)

  const policies = useMemo(() => overview?.policies ?? [], [overview])
  const eff = useCallback(
    (p: PolicyView): CollectionPolicy => ({
      enabled: edits[p.name]?.enabled ?? p.enabled,
      retentionDays: edits[p.name]?.retentionDays ?? p.retentionDays,
      intervalDays: edits[p.name]?.intervalDays ?? p.intervalDays,
    }),
    [edits],
  )
  const setEdit = (name: string, patch: Partial<CollectionPolicy>) => setEdits(e => ({ ...e, [name]: { ...e[name], ...patch } }))

  /** Hanya field yang benar-benar berbeda dari yang tersimpan. */
  const diff = useMemo(() => {
    if (!overview) return { policies: {} as Edits, global: {} as Partial<GlobalSettings>, count: 0 }
    const outP: Edits = {}
    let count = 0
    for (const p of overview.policies) {
      const e = edits[p.name]
      if (!e) continue
      const d: Partial<CollectionPolicy> = {}
      if (e.enabled !== undefined && e.enabled !== p.enabled) d.enabled = e.enabled
      if (e.retentionDays !== undefined && e.retentionDays !== p.retentionDays) d.retentionDays = e.retentionDays
      if (e.intervalDays !== undefined && e.intervalDays !== p.intervalDays) d.intervalDays = e.intervalDays
      if (Object.keys(d).length) {
        outP[p.name] = d
        count += Object.keys(d).length
      }
    }
    const outG: Partial<GlobalSettings> = {}
    for (const k of Object.keys(globalEdits) as (keyof GlobalSettings)[]) {
      const v = globalEdits[k]
      if (v !== undefined && v !== overview.global[k]) {
        outG[k] = v
        count++
      }
    }
    return { policies: outP, global: outG, count }
  }, [overview, edits, globalEdits])

  const gval = <K extends keyof GlobalSettings>(k: K): GlobalSettings[K] => (globalEdits[k] ?? overview!.global[k]) as GlobalSettings[K]

  const discard = () => {
    setEdits({})
    setGlobalEdits({})
    setNotice(null)
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const body: Record<string, unknown> = {}
      if (Object.keys(diff.policies).length) body.policies = diff.policies
      if (Object.keys(diff.global).length) body.global = diff.global
      const res = await adminFetch('/api/storage/settings', { method: 'PUT', body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) throw new Error(FORBIDDEN)
      if (!res.ok) throw new Error(data?.error ?? 'Could not save the settings.')
      setOverview(data as StorageOverview)
      setEdits({})
      setGlobalEdits({})
      setNotice({ tone: 'safe', text: 'Settings saved. The scheduler picks them up on its next check (within a minute).' })
    } catch (e) {
      setNotice({ tone: 'flag', text: e instanceof Error ? e.message : 'Could not save the settings.' })
    } finally {
      setSaving(false)
    }
  }

  const recordSnapshot = async () => {
    setNotice(null)
    try {
      const res = await adminFetch('/api/storage/actions', { method: 'POST', body: JSON.stringify({ action: 'snapshot' }) })
      if (res.status === 403) throw new Error(FORBIDDEN)
      if (!res.ok) throw new Error('Could not record a snapshot.')
      await load()
    } catch (e) {
      setNotice({ tone: 'flag', text: e instanceof Error ? e.message : 'Could not record a snapshot.' })
    }
  }

  if (failed && !overview) {
    return (
      <div className="page-x py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-flag-border bg-flag-bg p-6 text-center">
          <p className="font-medium text-flag">Storage information could not be loaded</p>
          <p className="text-sm text-chalk-dim mt-1">Check the database connection and try again.</p>
          <button type="button" onClick={() => void load()} className="mt-4 btn">Try again</button>
        </div>
      </div>
    )
  }
  if (!overview || now === null) return <Skeleton />

  const db = overview.db
  const tone: Tone = diskTone(db.fsPercent, overview.global.warnPercent, overview.global.critPercent)
  const heartbeatAge = overview.schedulerHeartbeatAt ? now - new Date(overview.schedulerHeartbeatAt).getTime() : null
  const schedulerDown = heartbeatAge === null || heartbeatAge > HEARTBEAT_STALE_MS
  const reclaimable = overview.collections.reduce((s, c) => s + (c.freeBytes ?? 0), 0)
  const hasReclaimInfo = overview.collections.some(c => c.freeBytes !== null)
  const sorted: CollectionStat[] = [...overview.collections].sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
  const barColor = `var(--accent-${tone === 'idle' ? 'safe' : tone})`
  const growth = points.length >= 2 ? points[points.length - 1].totalBytes - points[0].totalBytes : null
  const dialogPolicy = dialog ? policies.find(p => p.name === dialog.name) : undefined

  return (
    <div>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2.5">
            {schedulerDown ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-watch-border bg-watch-bg px-2.5 py-0.5 text-xs font-medium text-watch">
                <span className="w-2 h-2 rounded-full bg-watch" />
                Scheduler not running
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-safe-border bg-safe-bg px-2.5 py-0.5 text-xs font-medium text-safe">
                <span className="w-2 h-2 rounded-full bg-signal" />
                Scheduler running
              </span>
            )}
            <span className="text-xs text-chalk-dim">Updated {timeAgo(overview.generatedAt, now)}</span>

          </div>
        }
        title="Storage & cleanup"
        description="See how much space the database uses, and decide how long each kind of history is kept. Only old history is deleted; configuration such as the blocklist, classes and access points is never touched."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-chalk">Auto Refresh</span>
            <Segmented label="Auto refresh" value={refreshMs} onChange={setRefreshMs} options={REFRESH_OPTIONS} />
          </div>
        }
      />

      <div className="page-x py-5 md:py-7 space-y-5 pb-28">
        {failed && <Note tone="flag">The last refresh failed, so you are seeing earlier data. Retrying automatically.</Note>}
        {!authLoading && !isAdmin && (
          <Note tone="watch">You have view-only access. Only administrators can change retention or delete old data.</Note>
        )}
        {schedulerDown && (
          <Note tone="watch">
            The scheduler has not checked in {heartbeatAge === null ? 'yet' : `for ${Math.round(heartbeatAge / 60_000)} minutes`}, so automatic
            cleanup and size recording are paused. It starts with the dashboard server; restart the dashboard container, and check that{' '}
            <span className="font-mono">STORAGE_SCHEDULER</span> is not set to “off”. Manual cleanup still works.
          </Note>
        )}
        {tone === 'flag' && db.fsPercent !== null && (
          <Note tone="flag">Disk is {db.fsPercent}% full. Clean old data now, then reclaim disk space.</Note>
        )}
        {tone === 'watch' && db.fsPercent !== null && <Note tone="watch">Disk is {db.fsPercent}% full. Consider shorter retention.</Note>}

        {/* Ringkasan */}
        <dl className="chalk-surface grid grid-cols-2 lg:grid-cols-5 gap-px rounded-xl overflow-hidden border border-line bg-line">
          <div className="bg-surface px-4 md:px-5 py-4 col-span-2 min-w-0">
            <dt className="text-xs font-medium text-chalk-faint">Database size on disk</dt>
            <dd className="mt-1.5 font-mono text-[2.25rem] leading-none font-medium tnum text-chalk">{formatBytes(db.totalBytes)}</dd>
            <dd className="mt-2 text-xs text-chalk-faint">
              {formatBytes(db.dataBytes)} of data (uncompressed) + {formatBytes(db.indexBytes)} of indexes
            </dd>
          </div>
          <div className="bg-surface px-4 md:px-5 py-4 col-span-2 lg:col-span-1 min-w-0">
            <dt className="text-xs font-medium text-chalk-faint">Disk used</dt>
            <dd className={`mt-1.5 font-mono text-[1.75rem] leading-none font-medium tnum ${tone === 'flag' ? 'text-flag' : tone === 'watch' ? 'text-watch' : 'text-chalk'}`}>
              {db.fsPercent === null ? 'n/a' : `${db.fsPercent}%`}
            </dd>
            <dd className="mt-2 text-xs text-chalk-faint">
              {db.fsPercent === null ? 'not reported by MongoDB' : `${formatBytes(db.fsUsedBytes)} of ${formatBytes(db.fsTotalBytes)}`}
            </dd>
            {db.fsPercent !== null && (
              <div className="relative mt-2 h-1.5 rounded-full bg-surface-3" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, db.fsPercent))}%`, backgroundColor: barColor }} />
                <span className="absolute top-[-2px] h-2.5 w-px bg-watch" style={{ left: `${overview.global.warnPercent}%` }} />
                <span className="absolute top-[-2px] h-2.5 w-px bg-flag" style={{ left: `${overview.global.critPercent}%` }} />
              </div>
            )}
          </div>
          <div className="bg-surface px-4 md:px-5 py-4 min-w-0">
            <dt className="text-xs font-medium text-chalk-faint">Documents</dt>
            <dd className="mt-1.5 font-mono text-[1.75rem] leading-none font-medium tnum text-chalk">{nf(db.objects)}</dd>
            <dd className="mt-2 text-xs text-chalk-faint">{nf(db.collections)} collections</dd>
          </div>
          <div className="bg-surface px-4 md:px-5 py-4 min-w-0">
            <dt className="text-xs font-medium text-chalk-faint">Reusable space</dt>
            <dd className="mt-1.5 font-mono text-[1.75rem] leading-none font-medium tnum text-chalk">{hasReclaimInfo ? formatBytes(reclaimable) : 'n/a'}</dd>
            <dd className="mt-2 text-xs text-chalk-faint">freed inside files; “Reclaim disk space” returns it to the server</dd>
          </div>
        </dl>

        {/* Grafik */}
        <Panel
          title="Database size over time"
          caption={`Recorded every ${snapshotIntervalLabel(overview.global.snapshotIntervalMin)} by the scheduler`}
          action={<Segmented label="Chart range" value={rangeHours} onChange={setRangeHours} options={RANGE_OPTIONS} />}
        >
          {points.length < 2 ? (
            <div className="border-t border-line px-6 py-10 text-center">
              <p className="text-sm text-chalk-faint max-w-[48ch] mx-auto">
                Not enough history yet. The scheduler records the size every {snapshotIntervalLabel(overview.global.snapshotIntervalMin)}; the chart appears
                after two recordings.
              </p>
              <button type="button" onClick={() => void recordSnapshot()} className="mt-3 btn text-xs">
                Record a snapshot now
              </button>
            </div>
          ) : (
            <div className="border-t border-line px-4 md:px-5 py-4">
              <SizeChart points={points} hours={rangeHours} />
              <p className="mt-2 text-xs text-chalk-faint">
                Change in this range:{' '}
                <span className={`font-mono ${growth !== null && growth > 0 ? 'text-watch' : 'text-safe'}`}>
                  {growth !== null && growth >= 0 ? '+' : '−'}
                  {formatBytes(Math.abs(growth ?? 0))}
                </span>
                . Deleting documents does not shrink the file until you reclaim disk space.
              </p>
            </div>
          )}
        </Panel>

        {/* Tabel koleksi */}
        <Panel title="Space by collection" caption="Everything in the database, largest first. Protected collections are never cleaned.">
          <div className="table-scroll border-t border-line">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-chalk-faint">
                  <th className="px-4 md:px-5 py-2 font-medium">Collection</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Documents</th>
                  <th className="px-3 py-2 font-medium text-right">Size on disk</th>
                  <th className="px-3 py-2 font-medium w-40">Share</th>
                  <th className="px-3 py-2 font-medium text-right">Reusable</th>
                  <th className="px-4 md:px-5 py-2 font-medium">Oldest record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map(c => {
                  const share = db.totalBytes > 0 && c.totalBytes !== null ? (c.totalBytes / db.totalBytes) * 100 : 0
                  return (
                    <tr key={c.name}>
                      <td className="px-4 md:px-5 py-2.5">
                        <span className="block font-medium text-chalk">{c.label}</span>
                        {c.label !== c.name && <span className="block font-mono text-xs text-chalk-faint">{c.name}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                            c.role === 'cleanable' ? 'border-primary text-primary' : 'border-line text-chalk-dim'
                          }`}
                        >
                          {ROLE_LABEL[c.role]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tnum text-chalk-dim">{c.count === null ? '-' : nf(c.count)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tnum text-chalk">{formatBytes(c.totalBytes)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share > 0 ? 2 : 0, share)}%` }} />
                          </div>
                          <span className="w-10 text-right font-mono tnum text-xs text-chalk-faint">{share.toFixed(share < 10 ? 1 : 0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tnum text-chalk-dim">{c.freeBytes === null ? '-' : formatBytes(c.freeBytes)}</td>
                      <td className="px-4 md:px-5 py-2.5 text-chalk-dim whitespace-nowrap">{c.oldestAt ? formatDateTimeWIB(c.oldestAt) : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Kebijakan pembersihan */}
        <Panel
          title="Cleanup schedule"
          caption="Automatic cleanup is off until you turn it on. “Keep” is how many days of history stay; older records are deleted."
        >
          <div className="grid gap-3 p-3 md:p-4 pt-1 md:pt-1 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
            {policies.map(p => {
              const v = eff(p)
              const changed = Boolean(diff.policies[p.name])
              return (
                <article key={p.name} className={`rounded-lg border bg-surface-2 p-4 min-w-0 ${changed ? 'border-primary' : 'border-line'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-chalk">
                        {p.label}
                        {p.legacy && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-chalk-faint">legacy</span>}
                      </h3>
                      <p className="font-mono text-xs text-chalk-faint">{p.name}</p>
                    </div>
                    <label className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-medium text-chalk-dim">{v.enabled ? 'Auto on' : 'Auto off'}</span>
                      <Switch checked={v.enabled} onChange={on => setEdit(p.name, { enabled: on })} label={`Automatic cleanup for ${p.label}`} />
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-chalk-faint">{p.description}</p>
                  {p.caution && <p className="mt-2 rounded-md border border-watch-border bg-watch-bg px-2.5 py-1.5 text-xs text-watch">{p.caution}</p>}

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                    <NumberField
                      label="Keep the last"
                      suffix="days"
                      value={v.retentionDays}
                      min={p.minRetentionDays}
                      max={3650}
                      onChange={n => setEdit(p.name, { retentionDays: n })}
                    />
                    <NumberField label="Clean every" suffix="days" value={v.intervalDays} min={1} max={90} onChange={n => setEdit(p.name, { intervalDays: n })} />
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-chalk-faint">
                    <p>
                      {v.enabled
                        ? p.nextRunAt
                          ? `Next automatic run: ${formatDateTimeWIB(p.nextRunAt)} WIB`
                          : 'Next run is being scheduled…'
                        : 'No automatic runs are scheduled.'}
                      {changed && ' (unsaved changes)'}
                    </p>
                    <p className="flex items-start gap-1.5">
                      <span className="mt-1"><StatusDot status={p.lastStatus} /></span>
                      <span className="min-w-0">
                        {p.lastRunAt ? (
                          <>
                            Last run {timeAgo(p.lastRunAt, now)} ({p.lastMode}) — {p.lastMessage}
                          </>
                        ) : (
                          'Never cleaned.'
                        )}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={Number.isNaN(v.retentionDays) || v.retentionDays < p.minRetentionDays}
                      onClick={() => setDialog({ kind: 'clean', name: p.name })}
                    >
                      Clean now…
                    </button>
                    <button type="button" className="btn text-xs" onClick={() => setDialog({ kind: 'compact', name: p.name })}>
                      Reclaim disk space…
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </Panel>

        {/* Pemantauan & jadwal */}
        <Panel title="Monitoring & timing" caption="How often the size is recorded, when automatic cleanup runs, and when the disk warnings appear.">
          <div className="border-t border-line px-4 md:px-5 py-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-chalk-dim">Record the size every</span>
              <select
                value={gval('snapshotIntervalMin')}
                onChange={e => setGlobalEdits(g => ({ ...g, snapshotIntervalMin: Number(e.target.value) }))}
                className="mt-1 w-full max-w-[12rem] rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-chalk"
              >
                {SNAPSHOT_INTERVALS.map(m => (
                  <option key={m} value={m}>{snapshotIntervalLabel(m)}</option>
                ))}
              </select>
            </label>
            <NumberField
              label="Keep the chart history for"
              suffix="days"
              value={gval('snapshotRetentionDays')}
              min={1}
              max={365}
              onChange={n => setGlobalEdits(g => ({ ...g, snapshotRetentionDays: n }))}
            />
            <label className="block">
              <span className="text-xs font-medium text-chalk-dim">Run automatic cleanup at (WIB)</span>
              <select
                value={gval('runHour')}
                onChange={e => setGlobalEdits(g => ({ ...g, runHour: Number(e.target.value) }))}
                className="mt-1 w-full max-w-[12rem] rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-chalk"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                ))}
              </select>
            </label>
            <NumberField
              label="Warn when disk is above"
              suffix="%"
              value={gval('warnPercent')}
              min={1}
              max={99}
              onChange={n => setGlobalEdits(g => ({ ...g, warnPercent: n }))}
            />
            <NumberField
              label="Critical when disk is above"
              suffix="%"
              value={gval('critPercent')}
              min={1}
              max={99}
              onChange={n => setGlobalEdits(g => ({ ...g, critPercent: n }))}
            />
          </div>
        </Panel>

        {/* Riwayat */}
        <Panel title="Cleanup history" caption="Latest actions, automatic and manual">
          {logs.length === 0 ? (
            <p className="border-t border-line px-4 md:px-5 py-6 text-sm text-chalk-faint">Nothing has been cleaned yet.</p>
          ) : (
            <div className="table-scroll border-t border-line">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-chalk-faint">
                    <th className="px-4 md:px-5 py-2 font-medium">When (WIB)</th>
                    <th className="px-3 py-2 font-medium">Collection</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium text-right">Deleted</th>
                    <th className="px-4 md:px-5 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {logs.map((l, i) => (
                    <tr key={`${l.at}-${l.collection}-${i}`}>
                      <td className="px-4 md:px-5 py-2.5 whitespace-nowrap text-chalk-dim">{formatDateTimeWIB(l.at)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-chalk">{l.collection}</td>
                      <td className="px-3 py-2.5 text-chalk-dim whitespace-nowrap">
                        {l.action === 'compact' ? 'Reclaim space' : 'Cleanup'} · {l.mode}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tnum text-chalk">{l.action === 'compact' ? '-' : nf(l.deleted)}</td>
                      <td className="px-4 md:px-5 py-2.5 text-chalk-dim">
                        <span className="flex items-start gap-2">
                          <span className="mt-1.5"><StatusDot status={l.status} /></span>
                          <span className="min-w-0">{l.message}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Bilah simpan: muncul hanya saat ada perubahan belum tersimpan */}
      {(diff.count > 0 || notice) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-2xl">
          <div className="page-x py-3 flex flex-wrap items-center gap-3">
            <p className={`mr-auto text-sm ${notice?.tone === 'flag' ? 'text-flag' : notice?.tone === 'safe' ? 'text-safe' : 'text-chalk-dim'}`} role="status">
              {notice ? notice.text : `${diff.count} unsaved ${diff.count === 1 ? 'change' : 'changes'}`}
            </p>
            {diff.count > 0 && (
              <>
                <button type="button" onClick={discard} disabled={saving} className="px-3 py-2 rounded-lg text-sm font-medium text-chalk-dim hover:bg-surface-2">
                  Discard
                </button>
                <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            )}
            {diff.count === 0 && notice && (
              <button type="button" onClick={() => setNotice(null)} className="px-3 py-2 rounded-lg text-sm font-medium text-chalk-dim hover:bg-surface-2">
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {dialog?.kind === 'clean' && dialogPolicy && (
        <CleanDialog
          policy={dialogPolicy}
          retentionDays={eff(dialogPolicy).retentionDays}
          onClose={() => setDialog(null)}
          onChanged={() => void load()}
        />
      )}
      {dialog?.kind === 'compact' && dialogPolicy && (
        <CompactDialog name={dialogPolicy.name} label={dialogPolicy.label} onClose={() => setDialog(null)} onChanged={() => void load()} />
      )}
    </div>
  )
}