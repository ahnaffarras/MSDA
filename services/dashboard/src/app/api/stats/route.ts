import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { sinceFilter } from '@/lib/query'

const uri = process.env.MONGODB_URI || 'mongodb://sata:sata123@mongo:27017/sata?authSource=admin'

export async function GET() {
  let client: MongoClient | null = null
  
  try {
    client = await MongoClient.connect(uri)
    const db = client.db('sata')
    
    // Get current time and 5 minutes ago for active clients
    
    // Total events count
    const totalEvents = await db.collection('ip_access_dns').countDocuments()
    
    // Detected threats (blocked actions)
    const detectedThreats = await db.collection('ip_access_dns').countDocuments({
      action: 'blocked'
    })
    
    // Active clients - unique IPs from last 5 minutes
    let activeClientsArray = await db.collection('ip_access_dns').distinct('client_ip', sinceFilter(5 / 60))
    
    // If no recent activity, count all unique client IPs (for demo/seeded data)
    if (activeClientsArray.length === 0) {
      activeClientsArray = await db.collection('ip_access_dns').distinct('client_ip')
      // Filter out null/empty
      activeClientsArray = activeClientsArray.filter((ip: string | null) => ip && ip !== '')
    }
    
    // Blacklisted domains count
    const blacklistedDomains = await db.collection('dns_blacklist').countDocuments()
    
    return NextResponse.json({
      totalEvents,
      detectedThreats,
      activeClients: activeClientsArray.length,
      blacklistedDomains
    })
  } catch (error) {
    console.error('Stats API Error:', error)
    return NextResponse.json({
      totalEvents: 0,
      detectedThreats: 0,
      activeClients: 0,
      blacklistedDomains: 0
    })
  } finally {
    if (client) await client.close()
  }
}
