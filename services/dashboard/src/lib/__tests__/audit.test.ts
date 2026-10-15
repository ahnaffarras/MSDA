import { describe, expect, it } from 'vitest'
import { buildAuditFilter, csvCell, queryFromSearchParams } from '@/lib/audit'

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
  })
  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toMatch(/^"'=/)
    expect(csvCell('+1+1')).toBe("'+1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })
  it('serializes null and objects', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
  })
})

describe('buildAuditFilter', () => {
  it('is empty without filters', () => {
    expect(buildAuditFilter({})).toEqual({})
  })
  it('reads date-only values as WIB calendar days', () => {
    const f = buildAuditFilter({ from: '2026-10-15', to: '2026-10-15' }) as { $and: { ts: { $gte: Date; $lte: Date } }[] }
    const ts = f.$and[0].ts
    expect(ts.$gte.toISOString()).toBe('2026-10-14T17:00:00.000Z') // 00:00 WIB
    expect(ts.$lte.toISOString()).toBe('2026-10-15T16:59:59.999Z') // 23:59:59.999 WIB
  })
  it('escapes regex characters typed by the user', () => {
    const f = buildAuditFilter({ actor: 'a.b*' }) as { $and: { actor_username: { $regex: string } }[] }
    expect(f.$and[0].actor_username.$regex).toBe('a\\.b\\*')
  })
  it('ignores unparseable dates instead of throwing', () => {
    expect(buildAuditFilter({ from: 'not-a-date' })).toEqual({})
  })
  it('maps URLSearchParams', () => {
    const q = queryFromSearchParams(new URLSearchParams('actor=ani&action=auth.login'))
    expect(q).toMatchObject({ actor: 'ani', action: 'auth.login' })
  })
})
