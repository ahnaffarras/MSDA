import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { actorOf, buildAuditFilter, csvCell, queryFromSearchParams, recordAudit, toAuditRow } from '@/lib/audit'
import { AUDIT_COLLECTION, AUDIT_EXPORT_MAX } from '@/lib/audit-types'

export const dynamic = 'force-dynamic'

/** GET /api/audit/export — CSV dari filter yang sama dengan daftar (maks. 10.000 baris). Khusus administrator. */
export async function GET(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const query = queryFromSearchParams(new URL(request.url).searchParams)
  const filter = buildAuditFilter(query)

  try {
    const col = (await getDb()).collection(AUDIT_COLLECTION)
    const docs = await col.find(filter).sort({ ts: -1, _id: -1 }).limit(AUDIT_EXPORT_MAX).toArray()

    const header = ['time_utc', 'actor', 'action', 'target_type', 'target_id', 'ip', 'meta']
    const lines = [header.join(',')]
    for (const d of docs) {
      const r = toAuditRow(d as Record<string, unknown>)
      lines.push([r.ts, r.actor_username, r.action, r.target_type, r.target_id, r.ip, r.meta].map(csvCell).join(','))
    }

    await recordAudit({ action: 'audit.export', request, actor: actorOf(guard.user), meta: { rows: docs.length, filter: query } })

    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse('\uFEFF' + lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="msda-audit-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[audit export]', error)
    return NextResponse.json({ error: 'Failed to export the audit log.' }, { status: 500 })
  }
}
