import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { escapeRegex, intParam, rangeFilter, riskOf, sinceFilter } from '@/lib/query'
import { resolveRange } from '@/lib/time-range'
import { ipMaskerFor } from '@/lib/privacy-settings'

/**
 * GET /api/events
 * Query: range=today|24h|7d|30d|custom (+from,to) ATAU hours (lama), limit (default 50, maks 10000),
 *        lab, ap_ip, client_ip, domain, after (ISO: hanya kejadian SETELAH waktu itu; untuk live feed)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = intParam(searchParams.get('limit'), 50, 1, 10000)
  const hoursParam = searchParams.get('hours')
  const rangeParam = searchParams.get('range')
  const lab = searchParams.get('lab') || 'all'
  const apIp = searchParams.get('ap_ip')
  const clientIp = searchParams.get('client_ip')
  const domain = searchParams.get('domain')

  try {
    const db = await getDb()
    const mask = await ipMaskerFor(request)

    const and: Record<string, unknown>[] = []
    if (rangeParam) {
      const r = resolveRange({ range: rangeParam, from: searchParams.get('from'), to: searchParams.get('to') })
      and.push(rangeFilter(r.from, r.to))
    } else if (hoursParam) and.push(sinceFilter(intParam(hoursParam, 24, 1, 24 * 90)))
    if (lab !== 'all') and.push({ 'ap_info.label': new RegExp(`Lab.*${escapeRegex(lab)}`, 'i') })
    if (apIp) {
      const ips = apIp.split(',').map(s => s.trim()).filter(Boolean)
      if (ips.length > 1) {
        and.push({ $or: [{ 'ap_info.ip': { $in: ips } }, { ap_ip: { $in: ips } }] })
      } else {
        and.push({ $or: [{ 'ap_info.ip': ips[0] }, { ap_ip: ips[0] }] })
      }
    }
    const after = Date.parse(searchParams.get('after') ?? '')
    if (!Number.isNaN(after)) and.push(rangeFilter(new Date(after + 1), new Date(Date.now() + 60_000)))
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
        client_ip: mask(event.client_ip),
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
