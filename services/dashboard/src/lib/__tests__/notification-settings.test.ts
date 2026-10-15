import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_SETTINGS, parseNotificationSettings } from '@/lib/notification-settings'

const valid = () => JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS))

describe('parseNotificationSettings', () => {
  it('accepts the defaults', () => {
    const r = parseNotificationSettings(valid())
    expect(r.ok).toBe(true)
  })
  it('drops unknown fields and server-owned fields', () => {
    const input = { ...valid(), updated_by: 'hacker', token: 'x' }
    const r = parseNotificationSettings(input)
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['channels', 'digest_minutes', 'quiet_hours'])
  })
  it('rejects non-objects and missing sections', () => {
    expect(parseNotificationSettings(null).ok).toBe(false)
    expect(parseNotificationSettings([]).ok).toBe(false)
    expect(parseNotificationSettings({}).ok).toBe(false)
  })
  it('rejects bad severity, digest and times', () => {
    const a = valid(); a.channels.slack.min_severity = 'urgent'
    const b = valid(); b.digest_minutes = -1
    const c = valid(); c.digest_minutes = 1.5
    const d = valid(); d.digest_minutes = 100000
    const e = valid(); e.quiet_hours.start = '25:00'
    const f = valid(); f.quiet_hours.tz = 'Mars/Olympus'
    for (const bad of [a, b, c, d, e, f]) expect(parseNotificationSettings(bad).ok).toBe(false)
  })
  it('rejects identical quiet-hour times only when enabled', () => {
    const on = valid(); on.quiet_hours = { enabled: true, start: '22:00', end: '22:00', tz: 'Asia/Jakarta' }
    const off = valid(); off.quiet_hours = { enabled: false, start: '22:00', end: '22:00', tz: 'Asia/Jakarta' }
    expect(parseNotificationSettings(on).ok).toBe(false)
    expect(parseNotificationSettings(off).ok).toBe(true)
  })
})
