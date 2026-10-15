import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { buildAuditFilter, queryFromSearchParams, toAuditRow } from '@/lib/audit'
import { AUDIT_COLLECTION, AUDIT_PAGE_SIZE } from '@/lib/audit-types'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/audit?actor=&action=&from=&to=&q=&page=
 * Khusus administrator. `from`/`to` boleh YYYY-MM-DD (hari WIB) atau ISO 8601.
 */
export async function GET(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const sp = new URL(request.url).searchParams
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.get('page') ?? '1', 10) || 1))
  const filter = buildAuditFilter(queryFromSearchParams(sp))

  try {
    const col = (await getDb()).collection(AUDIT_COLLECTION)
    const [total, docs] = await Promise.all([
      col.countDocuments(filter),
      col
        .find(filter)
        .sort({ ts: -1, _id: -1 })
        .skip((page - 1) * AUDIT_PAGE_SIZE)
        .limit(AUDIT_PAGE_SIZE)
        .toArray(),
    ])
    return NextResponse.json(
      {
        data: docs.map(d => toAuditRow(d as Record<string, unknown>)),
        meta: { page, limit: AUDIT_PAGE_SIZE, total, total_pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) },
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[audit GET]', error)
    return NextResponse.json({ error: 'Failed to load the audit log.' }, { status: 500, headers: NO_STORE })
  }
}
