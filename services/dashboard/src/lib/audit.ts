import { ObjectId, type Db, type Filter } from 'mongodb'
import { getDb } from '@/lib/db'
import { clientIp, type AuthedUser } from '@/lib/auth'
import { AUDIT_COLLECTION, type AuditAction, type AuditRow } from '@/lib/audit-types'

/**
 * Audit log — siapa melakukan apa, kapan, dari IP mana.
 *
 * Aturan:
 *  - recordAudit() TIDAK PERNAH melempar error: kegagalan mencatat tidak boleh
 *    menggagalkan aksi yang sudah berhasil (hanya dicatat di log server).
 *  - Nilai rahasia (password, token, secret, cookie, authorization) otomatis dibuang
 *    dari `meta`, apa pun yang dikirim pemanggil.
 */

export interface AuditActor {
  id?: string | null
  username?: string | null
}

export interface AuditInput {
  action: AuditAction
  /** Request asal — dipakai untuk mengambil IP klien. */
  request?: Request
  actor?: AuditActor | null
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
  /** Timpa IP (mis. sudah dihitung pemanggil). */
  ip?: string
}

export const actorOf = (authed: AuthedUser): AuditActor => ({
  id: authed.user.id,
  username: authed.user.username,
})

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|api[_-]?key/i

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (depth >= 3) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 20).map(v => sanitize(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (SENSITIVE.test(k)) continue
      out[k] = sanitize(v, depth + 1)
    }
    return out
  }
  return String(value)
}

let indexPromise: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexPromise) {
    const col = db.collection(AUDIT_COLLECTION)
    indexPromise = col
      .createIndexes([
        { key: { ts: -1 } },
        { key: { actor_username: 1, ts: -1 } },
        { key: { action: 1, ts: -1 } },
      ])
      .then(() => undefined)
      .catch(error => {
        indexPromise = null // coba lagi pada pencatatan berikutnya
        throw error
      })
  }
  return indexPromise
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const db = await getDb()
    await ensureIndexes(db).catch(error => console.error('[audit] index creation failed', error))
    const meta = input.meta ? (sanitize(input.meta) as Record<string, unknown>) : null
    await db.collection(AUDIT_COLLECTION).insertOne({
      ts: new Date(),
      actor_id: input.actor?.id ?? null,
      actor_username: input.actor?.username ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ? String(input.targetId).slice(0, 200) : null,
      ip: input.ip ?? (input.request ? clientIp(input.request) : null),
      meta,
    })
  } catch (error) {
    console.error('[audit] failed to record', input.action, error)
  }
}

/* ───────────────────────────── query ───────────────────────────── */

export interface AuditQuery {
  actor?: string
  action?: string
  from?: string
  to?: string
  q?: string
}

const WIB = '+07:00'
const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Tanggal saja (YYYY-MM-DD) dibaca sebagai hari kalender WIB; selain itu diparse sebagai ISO. */
function parseBoundary(v: string | undefined, end: boolean): Date | null {
  if (!v) return null
  const d = YMD.test(v) ? new Date(`${v}T${end ? '23:59:59.999' : '00:00:00.000'}${WIB}`) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function buildAuditFilter(q: AuditQuery): Filter<Record<string, unknown>> {
  const and: Filter<Record<string, unknown>>[] = []
  if (q.actor?.trim()) and.push({ actor_username: { $regex: escapeRegex(q.actor.trim().slice(0, 64)), $options: 'i' } })
  if (q.action?.trim()) and.push({ action: q.action.trim().slice(0, 64) })
  const from = parseBoundary(q.from, false)
  const to = parseBoundary(q.to, true)
  if (from || to) and.push({ ts: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } })
  if (q.q?.trim()) {
    const rx = { $regex: escapeRegex(q.q.trim().slice(0, 100)), $options: 'i' }
    and.push({ $or: [{ target_id: rx }, { target_type: rx }, { ip: rx }] })
  }
  return and.length ? { $and: and } : {}
}

export function queryFromSearchParams(sp: URLSearchParams): AuditQuery {
  return {
    actor: sp.get('actor') ?? undefined,
    action: sp.get('action') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    q: sp.get('q') ?? undefined,
  }
}

export function toAuditRow(doc: Record<string, unknown>): AuditRow {
  const ts = doc.ts instanceof Date ? doc.ts.toISOString() : String(doc.ts ?? '')
  const id = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id ?? '')
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    id,
    ts,
    actor_id: str(doc.actor_id),
    actor_username: str(doc.actor_username),
    action: String(doc.action ?? ''),
    target_type: str(doc.target_type),
    target_id: str(doc.target_id),
    ip: str(doc.ip),
    meta: doc.meta && typeof doc.meta === 'object' ? (doc.meta as Record<string, unknown>) : null,
  }
}

/** Netralkan sel CSV yang diawali karakter rumus (CSV/formula injection di Excel). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
