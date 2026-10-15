#!/usr/bin/env node
/**
 * Menjalankan explain("executionStats") untuk kueri utama dashboard dan mencetak ringkasannya.
 * Tujuan: memastikan kueri memakai index (IXSCAN) dan tidak memindai seluruh koleksi (COLLSCAN).
 *
 *   MONGODB_URI="mongodb://msda:PASSWORD@127.0.0.1:27017/msda?authSource=admin" \
 *   MONGODB_DB=msda node scripts/explain-queries.mjs
 *
 * (di server: gunakan docker-compose.dev.yml agar MongoDB terjangkau dari host)
 */
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Set MONGODB_URI first.')
  process.exit(1)
}
const client = new MongoClient(uri)
await client.connect()
const db = client.db(process.env.MONGODB_DB || 'msda')
const col = db.collection('ip_access_dns')

const day = 24 * 3600 * 1000
const from = new Date(Date.now() - 7 * day)
const to = new Date()
const range = { $or: [{ timestamp: { $gte: from, $lt: to } }, { timestamp: { $gte: from.toISOString(), $lt: to.toISOString() } }] }
const sample = await col.findOne({}, { projection: { client_ip: 1, domain: 1, 'ap_info.ip': 1 } })

const cases = {
  'time range (overview, events)': { filter: range },
  'client in range (client detail)': { filter: { $and: [range, { client_ip: sample?.client_ip ?? '0.0.0.0' }] } },
  'domain in range (domain detail)': { filter: { $and: [range, { domain: sample?.domain ?? 'x.example' }] } },
  'AP in range (network trends)': { filter: { $and: [range, { 'ap_info.ip': sample?.ap_info?.ip ?? '0.0.0.0' }] } },
}

function stages(plan, out = []) {
  if (!plan) return out
  out.push(plan.stage)
  if (plan.inputStage) stages(plan.inputStage, out)
  for (const s of plan.inputStages ?? []) stages(s, out)
  return out
}

for (const [name, { filter }] of Object.entries(cases)) {
  const ex = await col.find(filter).sort({ timestamp: -1 }).limit(50).explain('executionStats')
  const st = ex.executionStats
  const chain = stages(ex.queryPlanner.winningPlan)
  const scan = chain.includes('COLLSCAN') ? 'COLLSCAN  <-- needs an index' : chain.includes('IXSCAN') ? 'IXSCAN (ok)' : chain.join(' > ')
  console.log(`${name}\n  plan: ${scan}\n  examined docs: ${st.totalDocsExamined}  keys: ${st.totalKeysExamined}  returned: ${st.nReturned}  time: ${st.executionTimeMillis} ms\n`)
}
await client.close()
