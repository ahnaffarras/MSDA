import { describe, expect, it } from 'vitest'
import { PASSWORD_MAX, PASSWORD_MIN, safeNextPath, validatePassword } from '@/lib/auth-types'

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    expect(validatePassword('Tr0ub4dor-horse-battery', 'budi')).toBeNull()
  })
  it('rejects too short and too long', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN - 1))).toMatch(/at least/)
    expect(validatePassword('a1'.repeat(PASSWORD_MAX))).toMatch(/at most/)
  })
  it('rejects one repeated character', () => {
    expect(validatePassword('x'.repeat(14))).toMatch(/repeated/)
  })
  it('rejects common passwords regardless of case, including the MSDA ones', () => {
    expect(validatePassword('Password123')).toMatch(/common/)
    expect(validatePassword('MSDAadmin')).not.toBeNull()
    expect(validatePassword('msda12345')).not.toBeNull()
  })
  it('rejects passwords containing the username', () => {
    expect(validatePassword('my-budi-secret-99', 'budi')).toMatch(/username/)
  })
})

describe('safeNextPath', () => {
  it('keeps internal paths', () => {
    expect(safeNextPath('/storage?tab=1')).toBe('/storage?tab=1')
  })
  it('blocks open redirects', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNextPath(bad)).toBe('/')
    }
  })
  it('never redirects back to login or api', () => {
    expect(safeNextPath('/login')).toBe('/')
    expect(safeNextPath('/login?next=/x')).toBe('/')
    expect(safeNextPath('/api/users')).toBe('/')
  })
})
