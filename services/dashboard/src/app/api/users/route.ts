import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { guardAdmin } from '@/lib/admin'
import { hashPassword, isDuplicateKey, normalizeUsername, toPublicUser, usersCol, type UserDoc } from '@/lib/auth'
import { ROLES, USERNAME_HELP, validatePassword, type Role } from '@/lib/auth-types'
import { actorOf, recordAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** GET /api/users — daftar pengguna dashboard (khusus administrator). */
export async function GET(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  try {
    const users = await usersCol()
    const docs = await users.find({}).sort({ role: 1, username: 1 }).toArray()
    return NextResponse.json({ users: docs.map(toPublicUser), me: guard.user.user.id }, { headers: NO_STORE })
  } catch (error) {
    console.error('[users GET]', error)
    return NextResponse.json({ error: 'Failed to load users.' }, { status: 500, headers: NO_STORE })
  }
}

/** POST /api/users   Body: { username, displayName?, role, password } */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }

  const username = normalizeUsername(body.username)
  if (!username) return NextResponse.json({ error: `Invalid username. ${USERNAME_HELP}` }, { status: 400, headers: NO_STORE })

  const role = body.role
  if (typeof role !== 'string' || !ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'Choose a role.' }, { status: 400, headers: NO_STORE })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const problem = validatePassword(password, username)
  if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: NO_STORE })

  let displayName = username
  if (body.displayName !== undefined && body.displayName !== '') {
    if (typeof body.displayName !== 'string' || body.displayName.trim().length > 60) {
      return NextResponse.json({ error: 'Name must be at most 60 characters.' }, { status: 400, headers: NO_STORE })
    }
    displayName = body.displayName.trim() || username
  }

  try {
    const users = await usersCol()
    const now = new Date()
    const doc: UserDoc = {
      _id: new ObjectId(),
      username,
      display_name: displayName,
      role: role as Role,
      password_hash: await hashPassword(password),
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: guard.user.user.username,
      last_login_at: null,
      last_login_ip: null,
    }
    await users.insertOne(doc)
    await recordAudit({
      action: 'user.create',
      request,
      actor: actorOf(guard.user),
      targetType: 'user',
      targetId: doc._id.toString(),
      meta: { username, role },
    })
    return NextResponse.json({ user: toPublicUser(doc) }, { status: 201, headers: NO_STORE })
  } catch (error) {
    if (isDuplicateKey(error)) {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409, headers: NO_STORE })
    }
    console.error('[users POST]', error)
    return NextResponse.json({ error: 'Failed to create the user.' }, { status: 500, headers: NO_STORE })
  }
}
