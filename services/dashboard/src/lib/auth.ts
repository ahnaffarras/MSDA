/**
 * Autentikasi dashboard (server-side).
 *
 * - Pengguna disimpan di MongoDB (`dashboard_users`); kata sandi di-hash dengan scrypt.
 * - Sesi = token acak di cookie HttpOnly. Yang disimpan di database hanya hash SHA-256-nya
 *   (`dashboard_sessions`), jadi kebocoran database tidak membocorkan sesi aktif.
 * - Menonaktifkan / menghapus pengguna atau mengganti kata sandi langsung mencabut sesinya.
 * - Percobaan login gagal dibatasi per username dan per IP (`dashboard_login_throttle`).
 */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ObjectId, type Collection, type Document, type Filter } from 'mongodb'
import { getDb } from '@/lib/db'
import {
  SESSION_COOKIE,
  USERNAME_RE,
  validatePassword,
  type PublicUser,
  type Role,
} from '@/lib/auth-types'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/* ───────────────────────────── konfigurasi ───────────────────────────── */

const SESSION_HOURS = Math.min(Math.max(Number(process.env.SATA_SESSION_HOURS) || 12, 1), 24 * 30)
export const SESSION_MAX_AGE_S = Math.round(SESSION_HOURS * 3600)

const MAX_FAILS_PER_USER = 5
const MAX_FAILS_PER_IP = 20
const FAIL_WINDOW_MS = 15 * 60_000
const LOCK_MS = 15 * 60_000

const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEYLEN = 64
const MAXMEM = 128 * 1024 * 1024

/* ───────────────────────────── koleksi ───────────────────────────── */

export interface UserDoc {
  _id: ObjectId
  username: string
  display_name: string
  role: Role
  password_hash: string
  is_active: boolean
  created_at: Date
  updated_at: Date
  created_by?: string
  last_login_at?: Date | null
  last_login_ip?: string | null
}

interface SessionDoc {
  token_hash: string
  user_id: ObjectId
  created_at: Date
  expires_at: Date
  ip: string
  user_agent: string
}

let indexesReady: Promise<void> | null = null

async function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb()
      await Promise.all([
        db.collection('dashboard_users').createIndex({ username: 1 }, { unique: true }),
        db.collection('dashboard_sessions').createIndex({ token_hash: 1 }, { unique: true }),
        db.collection('dashboard_sessions').createIndex({ user_id: 1 }),
        db.collection('dashboard_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
        db.collection('dashboard_login_throttle').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
      ])
    })().catch(err => {
      indexesReady = null // coba lagi pada panggilan berikutnya (mis. MongoDB belum siap)
      throw err
    })
  }
  return indexesReady
}

export async function usersCol(): Promise<Collection<UserDoc>> {
  await ensureIndexes()
  return (await getDb()).collection<UserDoc>('dashboard_users')
}

async function sessionsCol(): Promise<Collection<SessionDoc>> {
  await ensureIndexes()
  return (await getDb()).collection<SessionDoc>('dashboard_sessions')
}

async function throttleCol(): Promise<Collection<Document>> {
  await ensureIndexes()
  return (await getDb()).collection('dashboard_login_throttle')
}

/* ───────────────────────────── kata sandi ───────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM })
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  try {
    const actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAXMEM })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | null = null
/** Hash palsu agar waktu respons sama baik username ada maupun tidak (cegah enumerasi). */
export function burnPasswordCheck(password: string): Promise<boolean> {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'))
  return dummyHash.then(h => verifyPassword(password, h))
}

/* ───────────────────────────── pengguna ───────────────────────────── */

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: u._id.toHexString(),
    username: u.username,
    displayName: u.display_name || u.username,
    role: u.role,
    isActive: u.is_active,
    createdAt: u.created_at ? u.created_at.toISOString() : null,
    lastLoginAt: u.last_login_at ? u.last_login_at.toISOString() : null,
  }
}

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  return USERNAME_RE.test(v) ? v : null
}

export async function countActiveAdmins(excludeId?: ObjectId): Promise<number> {
  const col = await usersCol()
  const filter: Filter<UserDoc> = { role: 'admin', is_active: true }
  if (excludeId) filter._id = { $ne: excludeId }
  return col.countDocuments(filter)
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000
}

/* ───────────────────────────── sesi ───────────────────────────── */

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === SESSION_COOKIE) {
      const value = part.slice(i + 1).trim()
      return value || null
    }
  }
  return null
}

export async function createSession(userId: ObjectId, meta: { ip: string; userAgent: string }) {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_S * 1000)
  const col = await sessionsCol()
  await col.insertOne({
    token_hash: hashToken(token),
    user_id: userId,
    created_at: now,
    expires_at: expiresAt,
    ip: meta.ip,
    user_agent: meta.userAgent.slice(0, 200),
  })
  return { token, expiresAt }
}

export interface AuthedUser {
  doc: UserDoc
  user: PublicUser
  tokenHash: string
}

/** Kembalikan pengguna untuk token sesi, atau null kalau sesi tidak valid / kedaluwarsa / akun nonaktif. */
export async function validateSessionToken(token: string | null | undefined): Promise<AuthedUser | null> {
  if (!token || token.length > 200) return null
  const tokenHash = hashToken(token)
  const sessions = await sessionsCol()
  const session = await sessions.findOne({ token_hash: tokenHash, expires_at: { $gt: new Date() } })
  if (!session) return null
  const users = await usersCol()
  const doc = await users.findOne({ _id: session.user_id, is_active: true })
  if (!doc) return null
  return { doc, user: toPublicUser(doc), tokenHash }
}

export async function authenticate(request: Request): Promise<AuthedUser | null> {
  return validateSessionToken(readSessionToken(request))
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return
  const sessions = await sessionsCol()
  await sessions.deleteOne({ token_hash: hashToken(token) })
}

/** Cabut semua sesi pengguna (opsional kecuali satu sesi, mis. sesi yang sedang dipakai). */
export async function revokeUserSessions(userId: ObjectId, exceptTokenHash?: string): Promise<void> {
  const sessions = await sessionsCol()
  const filter: Filter<SessionDoc> = { user_id: userId }
  if (exceptTokenHash) filter.token_hash = { $ne: exceptTokenHash }
  await sessions.deleteMany(filter)
}

/* ───────────────────────────── pembatasan login ───────────────────────────── */

export async function lockedFor(key: string): Promise<number> {
  const col = await throttleCol()
  const doc = await col.findOne({ _id: key as unknown as ObjectId, locked_until: { $gt: new Date() } })
  return doc ? Math.max(1, Math.ceil((doc.locked_until.getTime() - Date.now()) / 1000)) : 0
}

async function recordFailure(key: string, limit: number): Promise<void> {
  const col = await throttleCol()
  const id = key as unknown as ObjectId
  const now = Date.now()
  const doc = await col.findOneAndUpdate({ _id: id, expires_at: { $gt: new Date(now) } }, { $inc: { count: 1 } }, { returnDocument: 'after' })
  if (!doc) {
    await col.replaceOne({ _id: id }, { _id: id, count: 1, expires_at: new Date(now + FAIL_WINDOW_MS) }, { upsert: true })
    return
  }
  if (doc.count >= limit) {
    const until = new Date(now + LOCK_MS)
    await col.updateOne({ _id: id }, { $set: { locked_until: until, expires_at: until } })
  }
}

export const userThrottleKey = (username: string) => `u:${username}`
export const ipThrottleKey = (ip: string) => `ip:${ip}`
export const passwordThrottleKey = (userId: string) => `pw:${userId}`

export const recordUserFailure = (key: string) => recordFailure(key, MAX_FAILS_PER_USER)
export const recordIpFailure = (key: string) => recordFailure(key, MAX_FAILS_PER_IP)

export async function clearThrottle(key: string): Promise<void> {
  const col = await throttleCol()
  await col.deleteOne({ _id: key as unknown as ObjectId })
}

/* ───────────────────────────── helper request ───────────────────────────── */

/**
 * IP klien. X-Forwarded-For hanya bisa dipercaya bila dashboard berada di belakang
 * reverse proxy Anda sendiri; kalau diakses langsung, nilainya bisa dipalsukan
 * (pembatasan per-username tetap berlaku).
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64) || 'unknown'
  return (request.headers.get('x-real-ip') ?? 'unknown').slice(0, 64)
}

/** Cookie diberi flag Secure bila diakses lewat HTTPS (atau dipaksa lewat SATA_COOKIE_SECURE). */
export function isSecureRequest(request: Request): boolean {
  const forced = process.env.SATA_COOKIE_SECURE
  if (forced === 'true') return true
  if (forced === 'false') return false
  const proto = request.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}

/* ───────────────────────────── akun admin pertama ───────────────────────────── */

let bootstrapped = false

/**
 * Bila belum ada pengguna sama sekali, buat administrator pertama dari
 * SATA_BOOTSTRAP_ADMIN_USER / SATA_BOOTSTRAP_ADMIN_PASSWORD. Kalau kata sandi tidak
 * diisi (atau terlalu lemah), dibuat kata sandi acak dan dicetak SEKALI ke log server.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  if (bootstrapped) return
  const col = await usersCol()
  if ((await col.countDocuments({}, { limit: 1 })) > 0) {
    bootstrapped = true
    return
  }

  const username = normalizeUsername(process.env.SATA_BOOTSTRAP_ADMIN_USER || 'admin') ?? 'admin'
  let password = process.env.SATA_BOOTSTRAP_ADMIN_PASSWORD ?? ''
  let generated = false
  if (!password) {
    generated = true
  } else {
    const problem = validatePassword(password, username)
    if (problem) {
      console.warn(`[auth] SATA_BOOTSTRAP_ADMIN_PASSWORD ditolak (${problem}). Membuat kata sandi acak.`)
      generated = true
    }
  }
  if (generated) password = randomBytes(15).toString('base64url')

  try {
    const now = new Date()
    await col.insertOne({
      _id: new ObjectId(),
      username,
      display_name: 'Administrator',
      role: 'admin',
      password_hash: await hashPassword(password),
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: 'bootstrap',
      last_login_at: null,
      last_login_ip: null,
    })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
  }
  bootstrapped = true

  if (generated) {
    console.warn(
      '\n[auth] ============================================================\n' +
        '[auth]  Akun administrator pertama dibuat. Login lalu GANTI kata sandi:\n' +
        `[auth]    username : ${username}\n` +
        `[auth]    password : ${password}\n` +
        '[auth]  Pesan ini hanya muncul sekali.\n' +
        '[auth] ============================================================\n',
    )
  } else {
    console.info(`[auth] Akun administrator pertama dibuat: "${username}".`)
  }
}

/** Dipanggil saat server start; mengulang sampai MongoDB siap. */
export function bootstrapWithRetry(attempt = 0): void {
  ensureBootstrapAdmin().catch(error => {
    if (attempt >= 24) {
      console.error('[auth] Gagal membuat admin pertama:', error)
      return
    }
    setTimeout(() => bootstrapWithRetry(attempt + 1), 5000).unref?.()
  })
}
