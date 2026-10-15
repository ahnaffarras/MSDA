import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { clientDetailHidden } from '@/lib/privacy-settings'
import { labelsFor } from '@/lib/client-devices-db'
import { isValidIp } from '@/lib/client-devices'

export const dynamic = 'force-dynamic'

/**
 * GET /api/client-devices/lookup?ips=1.1.1.1,2.2.2.2 → { labels: { ip: label } }
 * Untuk viewer dengan penyamaran aktif hasilnya kosong (label akan membuka identitas klien).
 */
export async function GET(request: Request) {
  const authed = await authenticate(request)
  if (!authed) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (await clientDetailHidden(request)) return NextResponse.json({ labels: {} }, { headers: { 'Cache-Control': 'no-store' } })
  const ips = (new URL(request.url).searchParams.get('ips') ?? '').split(',').map(s => s.trim()).filter(isValidIp).slice(0, 200)
  try {
    return NextResponse.json({ labels: await labelsFor(ips) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[client-devices lookup]', error)
    return NextResponse.json({ labels: {} })
  }
}
