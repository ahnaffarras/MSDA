import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || 'mongodb://sata:sata123@mongo:27017/sata?authSource=admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '10')
  
  let client: MongoClient | null = null
  
  try {
    client = await MongoClient.connect(uri)
    const db = client.db('sata')
    
    // Aggregate top domains
    const topDomains = await db.collection('ip_access_dns').aggregate([
      {
        $group: {
          _id: '$domain',
          count: { $sum: 1 },
          detected: { $max: '$detected' },
          group: { $first: '$group' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          domain: '$_id',
          count: 1,
          detected: 1,
          group: 1,
          _id: 0
        }
      }
    ]).toArray()
    
    return NextResponse.json(topDomains)
  } catch (error) {
    console.error('Domains API Error:', error)
    return NextResponse.json([])
  } finally {
    if (client) await client.close()
  }
}
