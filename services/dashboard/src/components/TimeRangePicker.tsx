'use client'

import { useState } from 'react'
import { Segmented } from '@/components/PageHeader'
import { MAX_CUSTOM_DAYS, RANGE_PRESETS, parseWibDate, toWibYmd, type RangeKey, type RangeParams } from '@/lib/time-range'

const FIELD =
  'px-2.5 py-1.5 rounded-lg border border-line bg-background text-sm text-chalk focus:border-primary focus:outline-none'

/**
 * Pemilih rentang waktu global (C1): Today / 24h / 7d / 30d / Custom.
 * Tanggal kustom dibaca sebagai hari kalender WIB.
 */
export default function TimeRangePicker({
  params,
  onChange,
  presets,
  fallback = '24h',
}: {
  params: RangeParams
  onChange: (next: RangeParams) => void
  /** batasi tombol preset (mis. laporan harian hanya 7d/30d) */
  presets?: RangeKey[]
  /** rentang yang dianggap aktif bila URL belum memuat `range` */
  fallback?: RangeKey
}) {
  const shown = RANGE_PRESETS.filter(p => !presets || presets.includes(p.key))
  const active = params.range && [...shown.map(p => p.key), 'custom'].includes(params.range as RangeKey) ? params.range : fallback
  const [open, setOpen] = useState(active === 'custom')
  const [today] = useState(() => toWibYmd(Date.now()))
  const [from, setFrom] = useState(params.from ?? '')
  const [to, setTo] = useState(params.to ?? '')

  const valid = parseWibDate(from) !== null && parseWibDate(to) !== null && from <= to
  const tooLong = valid && (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > MAX_CUSTOM_DAYS

  return (
    <div className="flex flex-col items-start sm:items-end gap-2">
      <Segmented
        label="Time range"
        value={active}
        onChange={v => {
          if (v === 'custom') setOpen(true)
          else {
            setOpen(false)
            onChange({ range: v })
          }
        }}
        options={[...shown.map(p => ({ value: p.key as string, label: p.short })), { value: 'custom', label: 'Custom' }]}
      />
      {open && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={e => {
            e.preventDefault()
            if (valid) onChange({ range: 'custom', from, to })
          }}
        >
          <label className="text-xs text-chalk-dim">
            From (WIB)
            <input type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} className={`${FIELD} block mt-0.5`} />
          </label>
          <label className="text-xs text-chalk-dim">
            To (WIB)
            <input type="date" value={to} min={from || undefined} max={today} onChange={e => setTo(e.target.value)} className={`${FIELD} block mt-0.5`} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Apply
          </button>
          {tooLong && <p className="basis-full text-xs text-watch">Ranges longer than {MAX_CUSTOM_DAYS} days are shortened to the most recent {MAX_CUSTOM_DAYS}.</p>}
        </form>
      )}
    </div>
  )
}
