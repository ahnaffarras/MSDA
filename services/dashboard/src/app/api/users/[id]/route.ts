import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { guardAdmin } from '@/lib/admin'
import { countActiveAdmins, hashPassword, revokeUserSessions, toPublicUser, usersCol } from '@/lib/auth'
import { ROLES, validatePassword, type Role } from '@/lib/auth-types'
import { actorOf, recordAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const NO_STORE = { 'Cache-Control': 'no-store' }
const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE })

/**
 * PATCH /api/users/:id
 * Body (salah satu atau lebih): { displayName, role, isActive, password }
 * Akun sendiri hanya boleh diubah namanya di sini; peran / status / kata sandi sendiri
 * diubah lewat halaman "My account" (mencegah administrator mengunci dirinya sendiri).
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const { id } = await params
  if (!ObjectId.isValid(id)) return err('Invalid id', 400)
  const _id = new ObjectId(id)
  const isSelf = guard.user.doc._id.equals(_id)

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return err('Request body is not valid JSON.', 400)
  }

  try {
    const users = await usersCol()
    const target = await users.findOne({ _id })
    if (!target) return err('User not found', 404)

    const set: Record<string, unknown> = {}
    let revoke = false

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.length > 60) {
        return err('Name must be 1–60 characters.', 400)
      }
      set.display_name = body.displayName.trim()
    }

    const touchesAccess = body.role !== undefined || body.isActive !== undefined || body.password !== undefined
    if (isSelf && touchesAccess) {
      return err('You cannot change your own role, status or password here. Use “My account” instead.', 400)
    }

    let losesAdmin = false
    if (body.role !== undefined) {
      if (typeof body.role !== 'string' || !ROLES.includes(body.role as Role)) return err('Unknown role.', 400)
      set.role = body.role
      if (target.role === 'admin' && body.role !== 'admin') losesAdmin = true
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') return err('isActive must be true or false.', 400)
      set.is_active = body.isActive
      if (!body.isActive) {
        revoke = true
        if (target.role === 'admin') losesAdmin = true
      }
    }
    if (body.password !== undefined) {
      const problem = typeof body.password === 'string' ? validatePassword(body.password, target.username) : 'Invalid password.'
      if (problem) return err(problem, 400)
      set.password_hash = await hashPassword(body.password as string)
      revoke = true
    }

    if (Object.keys(set).length === 0) return err('No changes provided.', 400)

    if (losesAdmin && target.is_active && (await countActiveAdmins(_id)) < 1) {
      return err('Keep at least one active administrator.', 400)
    }

    set.updated_at = new Date()
    await users.updateOne({ _id }, { $set: set })
    if (revoke) await revokeUserSessions(_id)

    // Satu baris audit per jenis perubahan (password tidak pernah dicatat, hanya fakta ia di-reset)
    const actor = actorOf(guard.user)
    const base = { request, actor, targetType: 'user', targetId: id } as const
    if (body.password !== undefined) await recordAudit({ ...base, action: 'user.reset_password', meta: { username: target.username } })
    if (body.role !== undefined) await recordAudit({ ...base, action: 'user.change_role', meta: { username: target.username, from: target.role, to: body.role } })
    if (body.isActive !== undefined) await recordAudit({ ...base, action: 'user.set_active', meta: { username: target.username, is_active: body.isActive } })
    if (body.displayName !== undefined) await recordAudit({ ...base, action: 'user.update', meta: { username: target.username } })

    const fresh = await users.findOne({ _id })
    return NextResponse.json({ user: fresh ? toPublicUser(fresh) : null }, { headers: NO_STORE })
  } catch (error) {
    console.error('[users PATCH]', error)
    return err('Failed to update the user.', 500)
  }
}

/** DELETE /api/users/:id */
export async function DELETE(request: Request, { params }: Ctx) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const { id } = await params
  if (!ObjectId.isValid(id)) return err('Invalid id', 400)
  const _id = new ObjectId(id)
  if (guard.user.doc._id.equals(_id)) return err('You cannot delete your own account.', 400)

  try {
    const users = await usersCol()
    const target = await users.findOne({ _id })
    if (!target) return err('User not found', 404)
    if (target.role === 'admin' && target.is_active && (await countActiveAdmins(_id)) < 1) {
      return err('Keep at least one active administrator.', 400)
    }
    await users.deleteOne({ _id })
    await revokeUserSessions(_id)
    await recordAudit({
      action: 'user.delete',
      request,
      actor: actorOf(guard.user),
      targetType: 'user',
      targetId: id,
      meta: { username: target.username, role: target.role },
    })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (error) {
    console.error('[users DELETE]', error)
    return err('Failed to delete the user.', 500)
  }
}
