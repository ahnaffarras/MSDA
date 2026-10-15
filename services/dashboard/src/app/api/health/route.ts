import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health — publik (dipakai healthcheck Docker). Hanya mengembalikan status,
 * tanpa pesan error, agar tidak membocorkan detail infrastruktur.
 */
export async function GET() {
  let mongo: 'ok' | 'down' = 'ok'
  try {
    await (await getDb()).command({ ping: 1 })
  } catch {
    mongo = 'down'
  }
  const ok = mongo === 'ok'
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', service: 'msda-dashboard', mongo },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
