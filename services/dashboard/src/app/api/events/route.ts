import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { escapeRegex, intParam, riskOf, sinceFilter } from '@/lib/query'

/**
 * GET /api/events
 * Query: hours (default 24), limit (default 50, maks 20000),
 *        lab, ap_ip, client_ip, domain
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = intParam(searchParams.get('limit'), 50, 1, 20000)
  const hoursParam = searchParams.get('hours')
  const lab = searchParams.get('lab') || 'all'
  const apIp = searchParams.get('ap_ip')
  const clientIp = searchParams.get('client_ip')
  const domain = searchParams.get('domain')

  try {
    const db = await getDb()

    const and: Record<string, unknown>[] = []
    if (hoursParam) and.push(sinceFilter(intParam(hoursParam, 24, 1, 24 * 90)))
    if (lab !== 'all') and.push({ 'ap_info.label': new RegExp(`Lab.*${escapeRegex(lab)}`, 'i') })
    if (apIp) {
      const ips = apIp.split(',').map(s => s.trim()).filter(Boolean)
      if (ips.length > 1) {
        and.push({ $or: [{ 'ap_info.ip': { $in: ips } }, { ap_ip: { $in: ips } }] })
      } else {
        and.push({ $or: [{ 'ap_info.ip': ips[0] }, { ap_ip: ips[0] }] })
      }
    }
    if (clientIp) and.push({ client_ip: clientIp })
    if (domain) and.push({ domain })
    const query = and.length ? { $and: and } : {}

    const events = await db
      .collection('ip_access_dns')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()

    return NextResponse.json(
      events.map(event => ({
        ...event,
        _id: event._id.toString(),
        timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
        ap_ip: event.ap_info?.ip || event.ap_ip || '',
        ap_name: event.ap_info?.label || event.ap_name || '',
        risk_level: riskOf(event as { risk_level?: string; action?: string; type?: string }),
        detected: event.action === 'blocked',
      }))
    )
  } catch (error) {
    console.error('Events API Error:', error)
    return NextResponse.json([])
  }
}
