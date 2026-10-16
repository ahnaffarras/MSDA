import type { Db } from 'mongodb'
import { BLACKLIST_TYPES, isKnownType, matchesBlacklist, normalizeDomain, type BlacklistSource } from '@/lib/blacklist'
import { checkEnforceable, isHighImpact, parseNeverBlock, type BlockMode } from '@/lib/enforce'

/** Domain di allowlist. Allowlist MENANG atas blocklist; entri `a.com` juga mencakup subdomainnya. */
export async function loadAllowlist(db: Db): Promise<string[]> {
  const docs = await db.collection('dns_allowlist').find({}, { projection: { domain: 1 } }).limit(20_000).toArray()
  return docs.map(d => String(d.domain)).filter(Boolean)
}

export const isAllowlisted = (domain: string, allow: string[]) => allow.some(a => matchesBlacklist(domain, a))

export interface NewEntry {
  input: string
  type?: string
  group?: string
  description?: string
  note?: string
  expires_at?: Date | null
  source?: BlacklistSource
  /** Default "alert". "enforce" = diblokir di DNS (hanya bila fitur enforcement aktif di backend). */
  block_mode?: BlockMode
  include_subdomains?: boolean
}

export type SkipReason = 'invalid' | 'exists' | 'duplicate_input' | 'allowlisted' | 'bad_type' | 'not_enforceable' | 'needs_confirmation'

/**
 * Tambahkan entri ke `dns_blacklist` (dipakai POST biasa dan impor CSV).
 * Field baru (`expires_at`, `source`, `note`) bersifat opsional/aditif; n8n yang tidak
 * mengenalnya tetap bekerja seperti sebelumnya.
 */
export async function addBlocklistEntries(db: Db, entries: NewEntry[], opts: { allowHighImpact?: boolean } = {}) {
  const col = db.collection('dns_blacklist')
  const allow = await loadAllowlist(db)
  const created: string[] = []
  const createdIds: string[] = []
  const neverBlock = parseNeverBlock(process.env.MSDA_NEVER_BLOCK)
  const skipped: { input: string; reason: SkipReason }[] = []
  const seen = new Set<string>()

  for (const e of entries) {
    const domain = normalizeDomain(e.input)
    if (!domain) {
      skipped.push({ input: e.input, reason: 'invalid' })
      continue
    }
    if (seen.has(domain)) {
      skipped.push({ input: e.input, reason: 'duplicate_input' })
      continue
    }
    seen.add(domain)
    const type = e.type || 'custom'
    if (!isKnownType(type)) {
      skipped.push({ input: domain, reason: 'bad_type' })
      continue
    }
    if (isAllowlisted(domain, allow)) {
      skipped.push({ input: domain, reason: 'allowlisted' })
      continue
    }
    if (await col.findOne({ domain })) {
      skipped.push({ input: domain, reason: 'exists' })
      continue
    }
    const enforce = e.block_mode === 'enforce'
    if (enforce) {
      if (!checkEnforceable(domain, neverBlock).ok) {
        skipped.push({ input: domain, reason: 'not_enforceable' })
        continue
      }
      // Domain populer/pendek hanya boleh di-Block lewat dialog konfirmasi per entri.
      if (isHighImpact(domain) && !opts.allowHighImpact) {
        skipped.push({ input: domain, reason: 'needs_confirmation' })
        continue
      }
    }
    const now = new Date()
    const description = (e.description ?? '').slice(0, 300)
    const note = (e.note ?? '').slice(0, 300)
    const ins = await col.insertOne({
      domain,
      group: e.group?.trim() || BLACKLIST_TYPES.find(t => t.value === type)?.group || 'Kustom',
      type,
      description: description || note,
      ...(note ? { note } : {}),
      blocked_level: 'domain',
      is_active: true,
      expires_at: e.expires_at ?? null,
      source: e.source ?? 'manual',
      ...(enforce ? { block_mode: 'enforce', enforce_status: 'pending' } : {}),
      ...(e.include_subdomains === false ? { include_subdomains: false } : {}),
      created_by: 'dashboard',
      created_at: now,
      updated_at: now,
    })
    created.push(domain)
    createdIds.push(ins.insertedId.toString())
  }
  return { created, createdIds, skipped }
}
