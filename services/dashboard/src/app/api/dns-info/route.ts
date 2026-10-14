import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { escapeRegex } from '@/lib/query'

const uri = process.env.MONGODB_URI || 'mongodb://msda:msda123@mongo:27017/msda?authSource=admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  
  let client: MongoClient | null = null
  
  try {
    client = await MongoClient.connect(uri)
    const db = client.db(process.env.MONGODB_DB || 'msda')
    
    const query: Record<string, unknown> = {}
    if (search) {
      query.domain = new RegExp(escapeRegex(search), 'i')
    }
    
    const dnsInfo = await db.collection('dns_info')
      .find(query)
      .limit(100)
      .toArray()
    
    // Transform to match DNS Info page fields
    const transformed = dnsInfo.map(doc => ({
      _id: doc._id?.toString(),
      domain: doc.domain || '-',
      // IP Address dari ip_scan array pertama
      ip_address: doc.ip_scan?.[0]?.ip || '-',
      // All IPs
      all_ips: (doc.ip_scan || []).map((s: { ip: string; type: string; geo: string }) => ({ ip: s.ip, type: s.type, geo: s.geo })),
      // Registrar = pemilik aplikasi
      registrar: doc.info_app?.owner || doc.info_app?.company_responsible || '-',
      // Company responsible
      company: doc.info_app?.company_responsible || '-',
      // Country dari geo IP scan atau host_isp
      country: doc.ip_scan?.[0]?.geo || doc.host_isp?.city || '-',
      // Kota dan region dari host_isp
      city: doc.host_isp?.city || '-',
      region: doc.host_isp?.region || '-',
      // ISP info
      org: doc.host_isp?.org || '-',
      asn: doc.host_isp?.asn || '-',
      // PTR hostname
      ptr_hostname: doc.ptr_hostname || '-',
      // Tanggal
      created_date: doc.timestamp ? new Date(doc.timestamp).toLocaleDateString('en-GB') : '-',
      updated_date: doc.last_verified ? new Date(doc.last_verified).toLocaleDateString('en-GB') : '-',
      expires_date: '-',
      // Kategori
      group: doc.group || 'Unknown',
      type: doc.type || 'unknown',
    }))
    
    return NextResponse.json(transformed)
  } catch (error) {
    console.error('DNS Info API Error:', error)
    return NextResponse.json([])
  } finally {
    if (client) await client.close()
  }
}
