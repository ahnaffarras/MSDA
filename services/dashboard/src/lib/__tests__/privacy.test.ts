import { describe, expect, it } from 'vitest'
import { isMaskedIp, maskIp, maskMac } from '@/lib/privacy'

const KEY = 'test-key'

describe('maskIp', () => {
  it('hides the last octet but keeps the subnet', () => {
    expect(maskIp('10.20.30.45', KEY)).toMatch(/^10\.20\.30\.x·[0-9a-f]{6}$/)
  })
  it('is deterministic and keeps different clients distinguishable', () => {
    expect(maskIp('10.0.0.5', KEY)).toBe(maskIp('10.0.0.5', KEY))
    expect(maskIp('10.0.0.5', KEY)).not.toBe(maskIp('10.0.0.6', KEY))
  })
  it('depends on the secret key (cannot be reversed by brute force without it)', () => {
    expect(maskIp('10.0.0.5', 'key-a')).not.toBe(maskIp('10.0.0.5', 'key-b'))
  })
  it('never contains the real last octet pattern', () => {
    expect(maskIp('192.168.1.200', KEY)).not.toContain('.200')
  })
  it('is idempotent and handles empty / IPv6 / junk', () => {
    const once = maskIp('10.0.0.5', KEY)
    expect(maskIp(once, KEY)).toBe(once)
    expect(maskIp('', KEY)).toBe('')
    expect(maskIp(null, KEY)).toBe('')
    expect(maskIp('fe80::1234:abcd', KEY)).toMatch(/^fe80::?.*x·[0-9a-f]{6}$/)
    expect(isMaskedIp(maskIp('not-an-ip', KEY))).toBe(true)
  })
  it('isMaskedIp separates masked from real addresses', () => {
    expect(isMaskedIp(maskIp('10.0.0.5', KEY))).toBe(true)
    expect(isMaskedIp('10.0.0.5')).toBe(false)
  })
})

describe('maskMac', () => {
  it('keeps only the vendor prefix', () => {
    expect(maskMac('AA:BB:CC:11:22:33')).toBe('AA:BB:CC:xx:xx:xx')
    expect(maskMac('aa-bb-cc-11-22-33')).toBe('aa:bb:cc:xx:xx:xx')
  })
  it('handles empty and malformed values', () => {
    expect(maskMac('')).toBe('')
    expect(maskMac('garbage')).toBe('xx:xx:xx:xx:xx:xx')
  })
})
