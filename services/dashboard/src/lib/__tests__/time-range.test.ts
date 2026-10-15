import { describe, expect, it } from 'vitest'
import { bucketFor, parseWibDate, resolveRange, rangeQuery, startOfWibDay, MAX_CUSTOM_DAYS } from '@/lib/time-range'
import { fillSeriesRange } from '@/lib/overview'

const NOW = new Date('2026-10-15T10:00:00.000Z') // 17:00 WIB
const H = 3_600_000
const D = 24 * H

describe('resolveRange presets', () => {
  it('defaults to 24h with an equal-length previous period', () => {
    const r = resolveRange({}, NOW)
    expect(r.key).toBe('24h')
    expect(r.to.getTime() - r.from.getTime()).toBe(D)
    expect(r.prevTo.getTime()).toBe(r.from.getTime())
    expect(r.prevTo.getTime() - r.prevFrom.getTime()).toBe(D)
    expect(r.bucketMs).toBe(H)
  })
  it('today starts at 00:00 WIB', () => {
    const r = resolveRange({ range: 'today' }, NOW)
    expect(r.from.toISOString()).toBe('2026-10-14T17:00:00.000Z')
    expect(r.phrase).toBe('today')
  })
  it('7d and 30d use daily buckets', () => {
    expect(resolveRange({ range: '7d' }, NOW).bucketMs).toBe(D)
    expect(resolveRange({ range: '30d' }, NOW).hours).toBe(720)
  })
  it('unknown keys fall back to 24h', () => {
    expect(resolveRange({ range: 'forever' }, NOW).key).toBe('24h')
  })
})

describe('resolveRange custom', () => {
  it('reads dates as inclusive WIB calendar days', () => {
    const r = resolveRange({ range: 'custom', from: '2026-10-10', to: '2026-10-12' }, NOW)
    expect(r.key).toBe('custom')
    expect(r.from.toISOString()).toBe('2026-10-09T17:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-10-12T17:00:00.000Z')
    expect(r.phrase).toBe('from 10 Oct to 12 Oct')
  })
  it('never extends past now', () => {
    const r = resolveRange({ range: 'custom', from: '2026-10-15', to: '2026-10-20' }, NOW)
    expect(r.to.getTime()).toBe(NOW.getTime())
  })
  it('caps very long ranges', () => {
    const r = resolveRange({ range: 'custom', from: '2025-01-01', to: '2026-10-14' }, NOW)
    expect(Math.round((r.to.getTime() - r.from.getTime()) / D)).toBe(MAX_CUSTOM_DAYS)
  })
  it('falls back to 24h on invalid or reversed dates', () => {
    expect(resolveRange({ range: 'custom', from: '2026-02-31', to: '2026-03-01' }, NOW).key).toBe('24h')
    expect(resolveRange({ range: 'custom', from: '2026-10-12', to: '2026-10-10' }, NOW).key).toBe('24h')
    expect(resolveRange({ range: 'custom', from: 'x', to: 'y' }, NOW).key).toBe('24h')
  })
})

describe('helpers', () => {
  it('parseWibDate validates calendar dates', () => {
    expect(parseWibDate('2026-10-15')).not.toBeNull()
    expect(parseWibDate('2026-13-01')).toBeNull()
    expect(parseWibDate('15-10-2026')).toBeNull()
    expect(parseWibDate(null)).toBeNull()
  })
  it('startOfWibDay', () => {
    expect(new Date(startOfWibDay(NOW.getTime())).toISOString()).toBe('2026-10-14T17:00:00.000Z')
  })
  it('bucketFor scales with span', () => {
    expect(bucketFor(H)).toBe(5 * 60_000)
    expect(bucketFor(6 * H)).toBe(30 * 60_000)
    expect(bucketFor(24 * H)).toBe(H)
    expect(bucketFor(10 * D)).toBe(D)
  })
  it('rangeQuery only emits valid custom dates', () => {
    expect(rangeQuery({ range: '7d' })).toBe('range=7d')
    expect(rangeQuery({ range: 'custom', from: '2026-10-01', to: '2026-10-05' })).toBe('range=custom&from=2026-10-01&to=2026-10-05')
    expect(rangeQuery({ range: 'custom', from: 'bad', to: '2026-10-05' })).toBe('range=24h')
  })
})

describe('fillSeriesRange', () => {
  it('fills empty buckets across the range', () => {
    const r = resolveRange({ range: '7d' }, NOW)
    const out = fillSeriesRange([], r.from.getTime(), r.to.getTime(), r.bucketMs)
    expect(out.length).toBeGreaterThanOrEqual(7)
    expect(out.every(p => p.queries === 0)).toBe(true)
  })
  it('keeps provided counts', () => {
    const r = resolveRange({ range: '24h' }, NOW)
    const start = Math.floor((NOW.getTime() + 7 * H) / H) * H - 7 * H - H // bucket penuh terakhir (batas atas eksklusif)
    const out = fillSeriesRange([{ start, queries: 5, flagged: 2 }], r.from.getTime(), r.to.getTime(), r.bucketMs)
    expect(out.find(p => new Date(p.start).getTime() === start)).toMatchObject({ queries: 5, flagged: 2 })
  })
})
