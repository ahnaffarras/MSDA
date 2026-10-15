import { describe, expect, it } from 'vitest'
import { buildHeatmap, percentDelta } from '@/lib/trends'

describe('percentDelta', () => {
  it('rounds the change', () => {
    expect(percentDelta(150, 100)).toBe(50)
    expect(percentDelta(50, 200)).toBe(-75)
    expect(percentDelta(101, 100)).toBe(1)
  })
  it('returns null when there is nothing to compare with', () => {
    expect(percentDelta(10, 0)).toBeNull()
    expect(percentDelta(0, 0)).toBeNull()
  })
})

describe('buildHeatmap', () => {
  it('maps Mongo weekdays (1=Sun) to Monday-first rows', () => {
    const h = buildHeatmap([
      { _id: { dow: 2, hour: 9 }, queries: 10 }, // Senin
      { _id: { dow: 1, hour: 23 }, queries: 4 }, // Minggu
      { _id: { dow: 7, hour: 0 }, queries: 7 }, // Sabtu
    ])
    expect(h.cells[0][9]).toBe(10)
    expect(h.cells[6][23]).toBe(4)
    expect(h.cells[5][0]).toBe(7)
    expect(h.max).toBe(10)
  })
  it('accumulates duplicates and ignores out-of-range rows', () => {
    const h = buildHeatmap([
      { _id: { dow: 3, hour: 1 }, queries: 2 },
      { _id: { dow: 3, hour: 1 }, queries: 3 },
      { _id: { dow: 9, hour: 1 }, queries: 99 },
      { _id: { dow: 3, hour: 30 }, queries: 99 },
    ])
    expect(h.cells[1][1]).toBe(5)
    expect(h.max).toBe(5)
  })
  it('is all zero when empty', () => {
    const h = buildHeatmap([])
    expect(h.max).toBe(0)
    expect(h.cells.flat().every(v => v === 0)).toBe(true)
    expect(h.cells).toHaveLength(7)
  })
})
