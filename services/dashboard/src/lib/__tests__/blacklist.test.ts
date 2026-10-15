import { describe, expect, it } from 'vitest'
import { isEffective, isExpired, matchesBlacklist, parseExpiry, type BlacklistEntry } from '@/lib/blacklist'

const entry = (over: Partial<BlacklistEntry> = {}): BlacklistEntry => ({
  _id: '1', domain: 'bad.example', group: 'g', type: 'custom', description: '', is_active: true, created_at: null, ...over,
})
const NOW = Date.parse('2026-10-15T10:00:00Z')

describe('parseExpiry', () => {
  it('reads a date as the end of that WIB day', () => {
    const d = parseExpiry('2026-12-31')
    expect(d).toBeInstanceOf(Date)
    expect((d as Date).toISOString()).toBe('2026-12-31T16:59:59.999Z')
  })
  it('treats empty as permanent and bad input as invalid', () => {
    expect(parseExpiry('')).toBeNull()
    expect(parseExpiry(null)).toBeNull()
    expect(parseExpiry('2026-02-31')).toBe('invalid')
    expect(parseExpiry('31/12/2026')).toBe('invalid')
    expect(parseExpiry(20261231)).toBe('invalid')
  })
})

describe('expiry and effectiveness', () => {
  it('permanent entries never expire', () => {
    expect(isExpired(entry(), NOW)).toBe(false)
    expect(isExpired(entry({ expires_at: null }), NOW)).toBe(false)
  })
  it('expires once the time has passed', () => {
    expect(isExpired(entry({ expires_at: '2026-10-15T09:59:59Z' }), NOW)).toBe(true)
    expect(isExpired(entry({ expires_at: '2026-10-16T00:00:00Z' }), NOW)).toBe(false)
  })
  it('an entry blocks only when active, not expired and not allowlisted', () => {
    expect(isEffective(entry(), NOW)).toBe(true)
    expect(isEffective(entry({ is_active: false }), NOW)).toBe(false)
    expect(isEffective(entry({ expires_at: '2026-01-01T00:00:00Z' }), NOW)).toBe(false)
    expect(isEffective(entry({ allowlisted: true }), NOW)).toBe(false)
  })
  it('allowlist semantics reuse the subdomain matching rule', () => {
    expect(matchesBlacklist('cdn.example.com', 'example.com')).toBe(true)
    expect(matchesBlacklist('example.com', 'example.com')).toBe(true)
    expect(matchesBlacklist('notexample.com', 'example.com')).toBe(false)
  })
})
