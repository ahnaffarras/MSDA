import { describe, expect, it } from 'vitest'
import { checkEnforceable, isHighImpact, parseNeverBlock } from '../enforce'
import { actionLabel, actionTone } from '../labels'

describe('checkEnforceable', () => {
  it('menolak TLD, label tunggal, dan public suffix', () => {
    for (const d of ['com', 'co.id', 'go.id', 'blogspot.com', '']) {
      const r = checkEnforceable(d)
      expect(r.ok, d).toBe(false)
    }
  })
  it('menerima domain terdaftar biasa', () => {
    expect(checkEnforceable('bet99.com').ok).toBe(true)
    expect(checkEnforceable('slot.example.co.id').ok).toBe(true)
  })
  it('never-block ditolak dua arah: sama, subdomain, dan induk', () => {
    const nb = ['dashboard.sekolah.sch.id', 'pool.ntp.org']
    expect(checkEnforceable('dashboard.sekolah.sch.id', nb).ok).toBe(false)
    expect(checkEnforceable('x.dashboard.sekolah.sch.id', nb).ok).toBe(false)
    expect(checkEnforceable('sekolah.sch.id', nb).ok).toBe(false) // induk
    expect(checkEnforceable('ntp.org', nb).ok).toBe(false)
    const r = checkEnforceable('ntp.org', nb)
    expect(!r.ok && r.code).toBe('never_block')
    expect(checkEnforceable('bet99.com', nb).ok).toBe(true)
  })
})

describe('isHighImpact', () => {
  it('domain populer dan subdomainnya butuh konfirmasi', () => {
    expect(isHighImpact('google.com')).toBe(true)
    expect(isHighImpact('mail.google.com')).toBe(true)
    expect(isHighImpact('youtube.com')).toBe(true)
  })
  it('domain sangat pendek butuh konfirmasi', () => {
    expect(isHighImpact('abc.com')).toBe(true)
    expect(isHighImpact('x.co.id')).toBe(true)
  })
  it('domain biasa tidak', () => {
    expect(isHighImpact('judi-online-99.com')).toBe(false)
  })
})

describe('parseNeverBlock', () => {
  it('memecah koma/spasi/titik koma, huruf kecil, buang titik akhir', () => {
    expect(parseNeverBlock('A.com, b.org.;c.net  ')).toEqual(['a.com', 'b.org', 'c.net'])
    expect(parseNeverBlock(undefined)).toEqual([])
  })
})

describe('label aksi', () => {
  it('"blocked" tanpa enforced = Matched blocklist (monitor), bukan Blocked', () => {
    expect(actionTone('blocked')).toBe('monitor')
    expect(actionTone('blocked', false)).toBe('monitor')
    expect(actionLabel('blocked')).toBe('Matched blocklist (monitor)')
  })
  it('hanya enforced === true yang Blocked', () => {
    expect(actionLabel('blocked', true)).toBe('Blocked')
    expect(actionTone('allowed', true)).toBe('allowed')
  })
})
