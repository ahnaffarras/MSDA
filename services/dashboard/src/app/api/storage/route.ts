import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getOverview } from '@/lib/storage-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/storage
 * Ukuran database & tiap koleksi (real-time), kebijakan pembersihan, dan status scheduler.
 * Hanya membaca; tidak mengubah apa pun.
 */
export async function GET() {
  try {
    const db = await getDb()
    return NextResponse.json(await getOverview(db), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Failed to read storage overview:', error)
    return NextResponse.json({ error: 'Failed to read storage information' }, { status: 500 })
  }
}
