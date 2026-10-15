import type { Collection, Filter } from 'mongodb'
import { getDb } from '@/lib/db'
import { deviceKey, type ClientDevice, type DeviceInput } from '@/lib/client-devices'

/** Dokumen di MongoDB (koleksi `client_devices`). */
export interface DeviceDoc {
  _id: string
  ip: string
  mac?: string
  hostname?: string
  label: string
  owner?: string
  note?: string
  ip_history: { ip: string; until: Date }[]
  first_seen: Date
  last_seen: Date
  source: 'manual' | 'csv' | 'dhcp'
  created_at: Date
  updated_at: Date
}

let indexed: Promise<void> | null = null

export async function devicesCol(): Promise<Collection<DeviceDoc>> {
  const col = (await getDb()).collection<DeviceDoc>('client_devices')
  if (!indexed) {
    indexed = col
      .createIndexes([{ key: { ip: 1 } }, { key: { mac: 1 }, sparse: true }, { key: { updated_at: -1 } }])
      .then(() => undefined)
      .catch(e => {
        indexed = null
        console.error('[client_devices] index creation failed', e)
      })
  }
  return col
}

export function toDevice(d: DeviceDoc): ClientDevice {
  return {
    id: d._id,
    ip: d.ip,
    mac: d.mac,
    hostname: d.hostname,
    label: d.label,
    owner: d.owner,
    note: d.note,
    ip_history: (d.ip_history ?? []).map(h => ({ ip: h.ip, until: h.until.toISOString() })),
    first_seen: d.first_seen?.toISOString() ?? null,
    last_seen: d.last_seen?.toISOString() ?? null,
    source: d.source,
    updated_at: d.updated_at?.toISOString() ?? null,
  }
}

/**
 * Simpan satu perangkat (upsert). Identitas = MAC bila ada, kalau tidak IP.
 * Bila perangkat ber-MAC berpindah IP, IP lama dimasukkan ke ip_history.
 * Mengembalikan 'created' | 'updated'.
 */
export async function upsertDevice(col: Collection<DeviceDoc>, input: DeviceInput, source: DeviceDoc['source']): Promise<'created' | 'updated'> {
  const _id = deviceKey(input)
  const now = new Date()
  const existing = await col.findOne({ _id })

  const fields = {
    ip: input.ip,
    label: input.label,
    ...(input.mac ? { mac: input.mac } : {}),
    ...(input.hostname ? { hostname: input.hostname } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.note ? { note: input.note } : {}),
    last_seen: now,
    updated_at: now,
  }
  const unset: Record<string, ''> = {}
  for (const k of ['hostname', 'owner', 'note'] as const) if (!input[k]) unset[k] = ''

  if (!existing) {
    await col.insertOne({ _id, ...fields, ip_history: [], first_seen: now, source, created_at: now } as DeviceDoc)
    return 'created'
  }
  const update: Record<string, unknown> = { $set: fields }
  if (Object.keys(unset).length) update.$unset = unset
  if (existing.ip !== input.ip) update.$push = { ip_history: { $each: [{ ip: existing.ip, until: now }], $slice: -20 } }
  await col.updateOne({ _id } as Filter<DeviceDoc>, update)
  return 'updated'
}

/** Peta ip → label untuk daftar IP (dipakai menampilkan label di daftar klien). */
export async function labelsFor(ips: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ips.filter(Boolean))].slice(0, 300)
  if (unique.length === 0) return {}
  const docs = await (await devicesCol()).find({ ip: { $in: unique } }).sort({ updated_at: 1 }).toArray()
  const out: Record<string, string> = {}
  for (const d of docs) out[d.ip] = d.label // yang terbaru menang
  return out
}
