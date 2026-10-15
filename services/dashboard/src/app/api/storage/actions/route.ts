import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import {
  InputError,
  compactCollection,
  previewCleanup,
  recordSnapshot,
  runCleanup,
} from '@/lib/storage-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/storage/actions
 * Body: { action: 'preview' | 'run' | 'compact' | 'snapshot', collection?, retentionDays?, confirm? }
 *
 *  preview  — hitung dokumen yang akan dihapus (read-only, tanpa token admin)
 *  run      — hapus dokumen riwayat lebih tua dari batas. Wajib token admin DAN
 *             `confirm` harus sama persis dengan nama koleksi (mencegah panggilan nyasar)
 *  compact  — kembalikan ruang kosong ke disk (tidak menghapus data). Token admin
 *  snapshot — catat ukuran database sekarang untuk grafik. Token admin
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 })
  }

  const action = body.action
  const collection = typeof body.collection === 'string' ? body.collection : ''
  const retentionDays =
    body.retentionDays === undefined || body.retentionDays === null ? null : body.retentionDays

  if (retentionDays !== null && (typeof retentionDays !== 'number' || !Number.isInteger(retentionDays))) {
    return NextResponse.json({ error: 'retentionDays must be a whole number.' }, { status: 400 })
  }

  let actor: ReturnType<typeof actorOf> | null = null
  if (action !== 'preview') {
    const guard = await guardAdmin(request)
    if (guard.denied) return guard.denied
    actor = actorOf(guard.user)
  }

  try {
    const db = await getDb()

    if (action === 'preview') {
      return NextResponse.json(await previewCleanup(db, collection, retentionDays))
    }

    if (action === 'run') {
      if (body.confirm !== collection || collection === '') {
        return NextResponse.json({ error: 'Type the collection name to confirm.' }, { status: 400 })
      }
      const result = await runCleanup(db, collection, {
        mode: 'manual',
        ...(retentionDays !== null ? { retentionDays } : {}),
      })
      await recordAudit({ action: 'storage.cleanup_run', request, actor, targetType: 'collection', targetId: collection, meta: { retentionDays, result } })
      return NextResponse.json(result)
    }

    if (action === 'compact') {
      const compacted = await compactCollection(db, collection)
      await recordAudit({ action: 'storage.compact', request, actor, targetType: 'collection', targetId: collection })
      return NextResponse.json(compacted)
    }

    if (action === 'snapshot') {
      await recordSnapshot(db)
      await recordAudit({ action: 'storage.snapshot', request, actor, targetType: 'storage' })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Storage action failed:', error)
    return NextResponse.json({ error: 'The action failed. Check the server log.' }, { status: 500 })
  }
}
