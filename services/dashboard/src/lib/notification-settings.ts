/**
 * Pengaturan notifikasi (koleksi `notification_settings`, satu dokumen `_id: "global"`).
 * Dibaca juga oleh n8n untuk memutuskan kanal, severity minimum, dan jam tenang.
 * Aman dibundel ke browser (tanpa impor server). Token bot/Slack TIDAK disimpan di sini.
 */

export type Severity = 'info' | 'warning' | 'critical'
export const SEVERITIES: Severity[] = ['info', 'warning', 'critical']
export const CHANNELS = ['slack', 'telegram'] as const
export type Channel = (typeof CHANNELS)[number]

export interface ChannelSetting {
  enabled: boolean
  min_severity: Severity
}

export interface NotificationSettings {
  channels: Record<Channel, ChannelSetting>
  /** 0 = kirim langsung; >0 = kumpulkan lalu kirim ringkasan tiap N menit */
  digest_minutes: number
  quiet_hours: { enabled: boolean; start: string; end: string; tz: string }
  updated_by?: string | null
  updated_at?: string | null
}

export const DIGEST_MAX_MINUTES = 1440

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  channels: {
    slack: { enabled: true, min_severity: 'warning' },
    telegram: { enabled: false, min_severity: 'critical' },
  },
  digest_minutes: 0,
  quiet_hours: { enabled: false, start: '22:00', end: '06:00', tz: 'Asia/Jakarta' },
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Validasi body PUT. Field tak dikenal dibuang; nilai tak valid ditolak dengan pesan jelas. */
export function parseNotificationSettings(input: unknown): Parsed<Omit<NotificationSettings, 'updated_by' | 'updated_at'>> {
  if (!isObj(input)) return { ok: false, error: 'Body must be a JSON object.' }
  const ch = input.channels
  if (!isObj(ch)) return { ok: false, error: 'channels is required.' }

  const channels = {} as Record<Channel, ChannelSetting>
  for (const name of CHANNELS) {
    const c = ch[name]
    if (!isObj(c)) return { ok: false, error: `channels.${name} is required.` }
    if (typeof c.enabled !== 'boolean') return { ok: false, error: `channels.${name}.enabled must be true or false.` }
    if (typeof c.min_severity !== 'string' || !SEVERITIES.includes(c.min_severity as Severity)) {
      return { ok: false, error: `channels.${name}.min_severity must be info, warning or critical.` }
    }
    channels[name] = { enabled: c.enabled, min_severity: c.min_severity as Severity }
  }

  const digest = input.digest_minutes
  if (typeof digest !== 'number' || !Number.isInteger(digest) || digest < 0 || digest > DIGEST_MAX_MINUTES) {
    return { ok: false, error: `digest_minutes must be a whole number from 0 to ${DIGEST_MAX_MINUTES}.` }
  }

  const q = input.quiet_hours
  if (!isObj(q)) return { ok: false, error: 'quiet_hours is required.' }
  if (typeof q.enabled !== 'boolean') return { ok: false, error: 'quiet_hours.enabled must be true or false.' }
  if (typeof q.start !== 'string' || !HHMM.test(q.start)) return { ok: false, error: 'quiet_hours.start must be HH:MM (24-hour).' }
  if (typeof q.end !== 'string' || !HHMM.test(q.end)) return { ok: false, error: 'quiet_hours.end must be HH:MM (24-hour).' }
  if (q.enabled && q.start === q.end) return { ok: false, error: 'Quiet hours start and end cannot be the same time.' }
  const tz = typeof q.tz === 'string' && q.tz ? q.tz : 'Asia/Jakarta'
  if (!validTz(tz)) return { ok: false, error: 'quiet_hours.tz is not a valid time zone.' }

  return {
    ok: true,
    value: { channels, digest_minutes: digest, quiet_hours: { enabled: q.enabled, start: q.start, end: q.end, tz } },
  }
}
