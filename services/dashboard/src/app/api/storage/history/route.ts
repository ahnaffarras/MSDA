import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { intParam } from '@/lib/query'
import { getLogs, getSnapshots } from '@/lib/storage-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/storage/history?hours=168&logs=30
 * Riwayat ukuran database (snapshot, sudah diringkas ≤120 titik) + log pembersihan terakhir.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const hours = intParam(searchParams.get('hours'), 168, 1, 24 * 90)
    const logs = intParam(searchParams.get('logs'), 30, 1, 100)
    const db = await getDb()
    const [points, entries] = await Promise.all([getSnapshots(db, hours), getLogs(db, logs)])
    return NextResponse.json({ hours, points, logs: entries }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Failed to read storage history:', error)
    return NextResponse.json({ error: 'Failed to read storage history' }, { status: 500 })
  }
}
