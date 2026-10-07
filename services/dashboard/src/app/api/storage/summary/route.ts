import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSummary } from '@/lib/storage-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/storage/summary
 * Ringkasan ringan untuk kartu Storage di halaman Dashboard (overview).
 */
export async function GET() {
  try {
    const db = await getDb()
    return NextResponse.json(await getSummary(db), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Failed to read storage summary:', error)
    return NextResponse.json({ error: 'Failed to read storage information' }, { status: 500 })
  }
}
