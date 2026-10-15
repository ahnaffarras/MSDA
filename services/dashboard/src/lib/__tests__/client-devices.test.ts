import { describe, expect, it } from 'vitest'
import { parseCsv, csvToObjects } from '@/lib/csv'
import { deviceKey, isValidIp, normalizeMac, parseDevicesCsv, validateDevice } from '@/lib/client-devices'

describe('parseCsv', () => {
  it('handles quotes, commas, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n')
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
  })
  it('keeps newlines inside quotes and drops blank lines', () => {
    expect(parseCsv('a\n\n"l1\nl2"\n')).toEqual([['a'], ['l1\nl2']])
  })
  it('csvToObjects lowercases headers and reports source line numbers', () => {
    const { headers, rows } = csvToObjects('IP, Label\n1.1.1.1,A\n2.2.2.2,B')
    expect(headers).toEqual(['ip', 'label'])
    expect(rows.map(r => r.line)).toEqual([2, 3])
    expect(rows[1].values).toEqual({ ip: '2.2.2.2', label: 'B' })
  })
})

describe('validators', () => {
  it('isValidIp', () => {
    expect(isValidIp('192.168.1.10')).toBe(true)
    expect(isValidIp('256.1.1.1')).toBe(false)
    expect(isValidIp('10.0.0')).toBe(false)
    expect(isValidIp('fe80::1')).toBe(true)
    expect(isValidIp('not an ip')).toBe(false)
  })
  it('normalizeMac', () => {
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff')
    expect(normalizeMac('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff')
    expect(normalizeMac('aa:bb:cc')).toBeNull()
  })
  it('deviceKey prefers the MAC (devices keep identity when the IP changes)', () => {
    expect(deviceKey({ ip: '1.1.1.1', mac: 'aa:bb:cc:dd:ee:ff' })).toBe('mac:aa:bb:cc:dd:ee:ff')
    expect(deviceKey({ ip: '1.1.1.1' })).toBe('ip:1.1.1.1')
  })
  it('validateDevice requires ip + label and trims', () => {
    expect(validateDevice({ ip: '', label: 'x' }).ok).toBe(false)
    expect(validateDevice({ ip: '1.1.1.1', label: '' }).ok).toBe(false)
    expect(validateDevice({ ip: '1.1.1.1', label: 'x'.repeat(81) }).ok).toBe(false)
    expect(validateDevice({ ip: '1.1.1.1', label: 'A', mac: 'zz' }).ok).toBe(false)
    const ok = validateDevice({ ip: ' 1.1.1.1 ', label: ' Lab PC ', owner: '', mac: 'AA-BB-CC-DD-EE-FF' })
    expect(ok.ok && ok.value).toEqual({ ip: '1.1.1.1', label: 'Lab PC', mac: 'aa:bb:cc:dd:ee:ff' })
  })
})

describe('parseDevicesCsv', () => {
  it('imports valid rows and reports bad ones with line numbers', () => {
    const r = parseDevicesCsv('ip,label,mac\n10.0.0.1,PC 1,aa:bb:cc:dd:ee:01\nbad,PC 2,\n10.0.0.3,,\n10.0.0.1,Dup,aa:bb:cc:dd:ee:01')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.devices).toHaveLength(1)
    expect(r.value.errors.map(e => e.line)).toEqual([3, 4, 5])
  })
  it('rejects files without the required columns, empty files and oversized files', () => {
    expect(parseDevicesCsv('foo,bar\n1,2').ok).toBe(false)
    expect(parseDevicesCsv('ip,label').ok).toBe(false)
    expect(parseDevicesCsv('ip,label\n' + 'x'.repeat(1_000_001)).ok).toBe(false)
  })
})
