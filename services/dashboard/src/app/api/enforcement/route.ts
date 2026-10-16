import { NextResponse } from 'next/server'
import { enforcementEnabled } from '@/lib/adguard'
import { parseNeverBlock } from '@/lib/enforce'

export const dynamic = 'force-dynamic'

/**
 * GET /api/enforcement → { enabled, never_block }
 * Dipakai UI untuk menampilkan/menyembunyikan kontrol enforcement dan menampilkan daftar never-block.
 * `enabled` diambil dari backend (sumber kebenaran: MSDA_ENFORCEMENT_ENABLED di backend).
 */
export async function GET() {
  return NextResponse.json({
    enabled: await enforcementEnabled(),
    never_block: parseNeverBlock(process.env.MSDA_NEVER_BLOCK),
  })
}
