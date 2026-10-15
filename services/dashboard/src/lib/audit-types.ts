/**
 * Tipe & daftar aksi audit yang dipakai server DAN browser (filter di halaman /audit).
 * Jangan impor modul Node (mongodb, crypto) di file ini.
 */

export const AUDIT_ACTION_LABELS = {
  'auth.login': 'Sign in',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_locked': 'Sign-in blocked (too many attempts)',
  'auth.logout': 'Sign out',
  'auth.password_change': 'Changed own password',
  'user.create': 'Created user',
  'user.update': 'Updated user',
  'user.reset_password': 'Reset user password',
  'user.change_role': 'Changed user role',
  'user.set_active': 'Enabled / disabled user',
  'user.delete': 'Deleted user',
  'blacklist.create': 'Added to blocklist',
  'blacklist.update': 'Edited blocklist entry',
  'blacklist.toggle': 'Enabled / disabled blocklist entry',
  'blacklist.delete': 'Removed from blocklist',
  'storage.settings_update': 'Changed storage settings',
  'storage.cleanup_run': 'Ran storage cleanup',
  'storage.compact': 'Compacted collection',
  'storage.snapshot': 'Recorded storage snapshot',
  'notification.status': 'Changed notification status',
  'notification.bulk_status': 'Changed notification status (bulk)',
  'notification.read_all': 'Marked all notifications read',
  'notification_settings.update': 'Changed notification settings',
  'notification_settings.test': 'Sent test notification',
  'audit.export': 'Exported audit log',
  'privacy.update': 'Changed privacy settings',
  'client_device.save': 'Saved client label',
  'client_device.delete': 'Deleted client label',
  'client_device.import': 'Imported client labels (CSV)',
  'allowlist.create': 'Added to allowlist',
  'allowlist.delete': 'Removed from allowlist',
  'blacklist.import': 'Imported blocklist (CSV)',
  'blacklist.bulk': 'Bulk blocklist change',
} as const

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]

export const AUDIT_COLLECTION = 'audit_logs'

/** Bentuk satu baris audit yang dikirim ke browser. */
export interface AuditRow {
  id: string
  ts: string
  actor_id: string | null
  actor_username: string | null
  action: string
  target_type: string | null
  target_id: string | null
  ip: string | null
  meta: Record<string, unknown> | null
}

export const AUDIT_PAGE_SIZE = 50
export const AUDIT_EXPORT_MAX = 10_000
