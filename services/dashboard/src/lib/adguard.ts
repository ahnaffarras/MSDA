import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'

/**
 * Jembatan server-ke-server dashboard → backend Go untuk DNS enforcement.
 * Dashboard TIDAK pernah memanggil AdGuard langsung dan tidak memegang kredensialnya.
 */

const backendBase = () => (process.env.MSDA_BACKEND_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

async function call(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const token = process.env.MSDA_INTERNAL_TOKEN
  if (!token) throw new Error('MSDA_INTERNAL_TOKEN is not set')
  const headers = new Headers(init.headers)
  headers.set('X-Internal-Token', token)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return fetch(`${backendBase()}/api/v1${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
}

/** Apakah fitur aktif di backend? Gagal menjangkau backend → false (UI menyembunyikan kontrol). */
export async function enforcementEnabled(): Promise<boolean> {
  try {
    const res = await call('/adguard/status', {}, 4_000)
    if (!res.ok) return false
    const j = (await res.json()) as { enabled?: boolean }
    return j.enabled === true
  } catch {
    return false
  }
}

export type SyncOutcome = 'disabled' | 'ok' | 'pending'

/**
 * Minta backend menyinkronkan aturan AdGuard sekarang. Bila gagal/timeout, entri enforce
 * yang disebut `ids` ditandai `pending` (ticker backend akan menyelesaikannya).
 */
export async function syncAdguard(ids: string[] = []): Promise<SyncOutcome> {
  try {
    const res = await call('/adguard/sync', { method: 'POST' })
    const j = (await res.json().catch(() => ({}))) as { enabled?: boolean; ok?: boolean }
    if (j.enabled === false) return 'disabled'
    if (res.ok && j.ok !== false) return 'ok'
  } catch (e) {
    console.error('[adguard sync]', e instanceof Error ? e.message : e)
  }
  await markPending(ids)
  return 'pending'
}

async function markPending(ids: string[]) {
  const valid = ids.filter(i => ObjectId.isValid(i)).map(i => new ObjectId(i))
  if (valid.length === 0) return
  try {
    const db = await getDb()
    await db.collection('dns_blacklist').updateMany(
      { _id: { $in: valid }, block_mode: 'enforce' },
      { $set: { enforce_status: 'pending', enforce_error: 'Waiting for the backend to sync with AdGuard Home' } },
    )
  } catch (e) {
    console.error('[adguard markPending]', e instanceof Error ? e.message : e)
  }
}
