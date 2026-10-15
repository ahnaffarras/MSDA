import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { csvCell } from '@/lib/audit'
import { dateBoundsFor, loadReports } from '@/lib/reports-data'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/export?range=...  → CSV ringkasan laporan harian (tanggal, total query,
 * jumlah AP, teks laporan). Sel dinetralkan dari formula spreadsheet.
 */
export async function GET(request: Request) {
  const authed = await authenticate(request)
  if (!authed) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const bounds = dateBoundsFor({ range: sp.get('range') ?? '30d', from: sp.get('from'), to: sp.get('to') })
  try {
    const rows = await loadReports(await getDb(), { bounds, limit: 120 })
    const lines = [['date', 'total_queries', 'access_points', 'report'].join(',')]
    for (const r of rows) lines.push([r.date || r.date_label, r.raw_rows, r.ap_count, r.report_text].map(csvCell).join(','))
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse('\uFEFF' + lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="msda-reports-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[reports export]', error)
    return NextResponse.json({ error: 'Failed to export reports' }, { status: 500 })
  }
}
