import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { addBlocklistEntries, type NewEntry } from '@/lib/blocklist-db'
import { csvToObjects } from '@/lib/csv'
import { parseExpiry } from '@/lib/blacklist'

export const dynamic = 'force-dynamic'
const MAX_ROWS = 5000
const MAX_BYTES = 1_000_000

/**
 * POST /api/blacklist/import   Body: { csv: "domain,type,group,description,note,expires_at\n..." }
 * Kolom wajib: domain. Baris tak valid dilewati dan dilaporkan; yang valid tetap masuk.
 * Domain yang tercakup allowlist ditolak (allowlist menang).
 */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  let csv: unknown
  try {
    csv = ((await request.json()) as { csv?: unknown })?.csv
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 })
  }
  if (typeof csv !== 'string' || csv.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Provide the CSV text in "csv" (maximum 1 MB)' }, { status: 400 })
  }
  const { headers, rows } = csvToObjects(csv)
  if (!headers.includes('domain')) return NextResponse.json({ error: 'The first row must be a header that includes a "domain" column' }, { status: 400 })
  if (rows.length === 0) return NextResponse.json({ error: 'The file has no data rows' }, { status: 400 })
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (maximum ${MAX_ROWS})` }, { status: 400 })

  const entries: NewEntry[] = []
  const errors: { line: number; reason: string }[] = []
  const lineOf = new Map<string, number>()
  for (const r of rows) {
    const exp = parseExpiry(r.values.expires_at)
    if (exp === 'invalid') {
      errors.push({ line: r.line, reason: 'expires_at must be YYYY-MM-DD' })
      continue
    }
    if (exp && exp.getTime() <= Date.now()) {
      errors.push({ line: r.line, reason: 'expires_at is in the past' })
      continue
    }
    lineOf.set(r.values.domain.toLowerCase(), r.line)
    entries.push({
      input: r.values.domain,
      type: r.values.type || 'custom',
      group: r.values.group,
      description: r.values.description,
      note: r.values.note,
      expires_at: exp,
      source: 'import',
    })
  }

  try {
    const { created, skipped } = await addBlocklistEntries(await getDb(), entries)
    for (const s of skipped) errors.push({ line: lineOf.get(s.input.toLowerCase()) ?? 0, reason: s.reason })
    await recordAudit({
      action: 'blacklist.import',
      request,
      actor: actorOf(guard.user),
      targetType: 'blacklist',
      meta: { created: created.length, skipped: errors.length },
    })
    return NextResponse.json({ created: created.length, skipped_count: errors.length, skipped: errors.slice(0, 50) }, { status: 200 })
  } catch (error) {
    console.error('[blacklist import]', error)
    return NextResponse.json({ error: 'Failed to import the blocklist' }, { status: 500 })
  }
}
