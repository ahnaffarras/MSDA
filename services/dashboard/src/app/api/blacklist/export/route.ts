import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { csvCell } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET /api/blacklist/export → CSV (domain,type,group,description,note,is_active,expires_at,source). */
export async function GET(request: Request) {
  const authed = await authenticate(request)
  if (!authed) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  try {
    const docs = await (await getDb()).collection('dns_blacklist').find({}).sort({ type: 1, domain: 1 }).limit(50_000).toArray()
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : '')
    const lines = [['domain', 'type', 'group', 'description', 'note', 'is_active', 'expires_at', 'source'].join(',')]
    for (const d of docs) {
      lines.push([d.domain, d.type, d.group, d.description, d.note, d.is_active !== false, iso(d.expires_at), d.source ?? 'manual'].map(csvCell).join(','))
    }
    return new NextResponse('\uFEFF' + lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="msda-blocklist-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[blacklist export]', error)
    return NextResponse.json({ error: 'Failed to export the blocklist' }, { status: 500 })
  }
}
