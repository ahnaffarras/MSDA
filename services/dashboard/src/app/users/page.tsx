'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import PageHeader from '@/components/PageHeader'
import PrivacyCard from '@/components/PrivacyCard'
import { useAuth } from '@/contexts/AuthContext'
import { adminFetch } from '@/lib/admin-client'
import {
  PASSWORD_MIN,
  ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  USERNAME_HELP,
  USERNAME_RE,
  validatePassword,
  type PublicUser,
  type Role,
} from '@/lib/auth-types'
import { formatDateTimeWIB, timeAgo } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; user: PublicUser }
  | { kind: 'password'; user: PublicUser }
  | { kind: 'delete'; user: PublicUser }
  | null

const field =
  'mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none'
const primaryBtn = 'btn !bg-primary !text-on-primary !border-transparent hover:!bg-primary-hover font-semibold'
const dangerBtn = 'btn !bg-flag !text-white !border-transparent hover:opacity-90 font-semibold'

function Badge({ tone, children }: { tone: 'primary' | 'safe' | 'muted'; children: ReactNode }) {
  const cls =
    tone === 'primary'
      ? 'border-primary/30 bg-primary-light text-primary'
      : tone === 'safe'
        ? 'border-safe-border bg-safe-bg text-safe'
        : 'border-line bg-surface-3 text-chalk-dim'
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

/** Dialog kecil yang dipakai ulang: Esc / klik latar menutup, fokus awal ke elemen pertama. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center p-0 sm:p-4" role="presentation">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgb(0 0 0 / 0.55)' }} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-line bg-surface p-5 md:p-6 max-h-[90dvh] overflow-y-auto"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <h2 className="text-lg font-semibold text-chalk">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p role="alert" className="rounded-lg border border-flag-border bg-flag-bg px-3 py-2 text-sm text-flag">
      {text}
    </p>
  )
}

/* ───────────────────────────── dialog: tambah ───────────────────────────── */

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) return setError(`Invalid username. ${USERNAME_HELP}`)
    const problem = validatePassword(password, u)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: u, displayName: displayName.trim(), role, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data?.error ?? 'Could not create the user.')
      onDone(`User “${u}” created. Give them the password in person; they can change it under My account.`)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-chalk">Username</span>
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={32} className={`${field} font-mono`} />
          <span className="mt-1 block text-xs text-chalk-faint">{USERNAME_HELP}</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-chalk">Name <span className="font-normal text-chalk-faint">(optional)</span></span>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} placeholder="e.g. Pak Budi" className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-chalk">Role</span>
          <select value={role} onChange={e => setRole(e.target.value as Role)} className={field}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <span className="mt-1 block text-xs text-chalk-faint">{ROLE_HINT[role]}</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-chalk">Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN} className={field} />
          <span className="mt-1 block text-xs text-chalk-faint">At least {PASSWORD_MIN} characters.</span>
        </label>
        <ErrorLine text={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Adding…' : 'Add user'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────────────────────────── dialog: ubah ───────────────────────────── */

function EditDialog({ user, isSelf, onClose, onDone }: { user: PublicUser; isSelf: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [role, setRole] = useState<Role>(user.role)
  const [isActive, setIsActive] = useState(user.isActive)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body: Record<string, unknown> = {}
    if (displayName.trim() !== user.displayName) body.displayName = displayName.trim()
    if (!isSelf && role !== user.role) body.role = role
    if (!isSelf && isActive !== user.isActive) body.isActive = isActive
    if (Object.keys(body).length === 0) return onClose()
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data?.error ?? 'Could not save the changes.')
      onDone(`Saved changes to “${user.username}”.`)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Edit ${user.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-chalk">Name</span>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={60} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-chalk">Role</span>
          <select value={role} onChange={e => setRole(e.target.value as Role)} disabled={isSelf} className={`${field} disabled:opacity-60`}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <span className="mt-1 block text-xs text-chalk-faint">{isSelf ? 'You cannot change your own role.' : ROLE_HINT[role]}</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} disabled={isSelf} className="mt-1 h-4 w-4" />
          <span>
            <span className="text-sm font-medium text-chalk">Account active</span>
            <span className="block text-xs text-chalk-faint">
              {isSelf ? 'You cannot deactivate yourself.' : 'Turn off to block sign-in. Their current sessions end immediately.'}
            </span>
          </span>
        </label>
        <ErrorLine text={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────────────────────────── dialog: reset sandi ───────────────────────────── */

function PasswordDialog({ user, onClose, onDone }: { user: PublicUser; onClose: () => void; onDone: (msg: string) => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validatePassword(password, user.username)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ password }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data?.error ?? 'Could not reset the password.')
      onDone(`Password for “${user.username}” was reset and their sessions were ended.`)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Reset password — ${user.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-chalk-dim">Set a new password and give it to them in person. They are signed out on every device.</p>
        <label className="block">
          <span className="text-sm font-medium text-chalk">New password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN} className={field} />
          <span className="mt-1 block text-xs text-chalk-faint">At least {PASSWORD_MIN} characters.</span>
        </label>
        <ErrorLine text={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving…' : 'Reset password'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────────────────────────── dialog: hapus ───────────────────────────── */

function DeleteDialog({ user, onClose, onDone }: { user: PublicUser; onClose: () => void; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setError(data?.error ?? 'Could not delete the user.')
      onDone(`User “${user.username}” deleted.`)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Delete user" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-chalk-dim">
          Delete <strong className="text-chalk">{user.username}</strong>? They lose access immediately and this cannot be undone.
          If you only want to block sign-in for a while, deactivate the account instead.
        </p>
        <ErrorLine text={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="button" onClick={() => void run()} disabled={busy} className={dangerBtn}>{busy ? 'Deleting…' : 'Delete user'}</button>
        </div>
      </div>
    </Modal>
  )
}

/* ───────────────────────────── halaman ───────────────────────────── */

export default function UsersPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [users, setUsers] = useState<PublicUser[]>([])
  const [meId, setMeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { cache: 'no-store', credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.users)) throw new Error(data?.error ?? 'Failed to load users.')
      setUsers(data.users)
      setMeId(String(data.me ?? ''))
      setLoadError(null)
      setNow(Date.now())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])
  useLoad(load)

  const close = useCallback(() => setDialog(null), [])
  const done = (msg: string) => {
    setDialog(null)
    setNotice(msg)
    void load()
  }

  const activeAdmins = users.filter(u => u.role === 'admin' && u.isActive).length

  if (!authLoading && !isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Users & access' }]} title="Users & access" />
        <div className="page-x py-6">
          <ErrorLine text="Administrator access is required to manage users." />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Users & access' }]}
        title="Users & access"
        description="Who can sign in to this dashboard. Administrators can also change the blocklist and storage settings; users can only view."
        actions={
          <button type="button" onClick={() => setDialog({ kind: 'create' })} className={primaryBtn}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
            Add user
          </button>
        }
      />

      <div className="page-x py-6 md:py-8 space-y-4">
        <PrivacyCard />
        {notice && (
          <p role="status" className="flex items-start justify-between gap-3 rounded-lg border border-safe-border bg-safe-bg px-3.5 py-2.5 text-sm text-safe">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-safe hover:opacity-70">✕</button>
          </p>
        )}
        <ErrorLine text={loadError} />

        <section className="rounded-xl border border-line bg-surface overflow-hidden" aria-label="User list">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-chalk-faint">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last sign-in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-chalk-dim">Loading…</td></tr>
                )}
                {!loading && users.length === 0 && !loadError && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-chalk-dim">No users yet.</td></tr>
                )}
                {users.map(u => {
                  const isSelf = u.id === meId
                  const lastAdmin = u.role === 'admin' && u.isActive && activeAdmins <= 1
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0 align-middle">
                      <td className="px-4 py-3">
                        <div className="font-medium text-chalk">
                          {u.displayName}
                          {isSelf && <span className="ml-2 text-xs font-normal text-chalk-faint">(you)</span>}
                        </div>
                        <div className="font-mono text-xs text-chalk-faint">{u.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={u.role === 'admin' ? 'primary' : 'muted'}>{ROLE_LABEL[u.role]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={u.isActive ? 'safe' : 'muted'}>{u.isActive ? 'Active' : 'Disabled'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-chalk-dim whitespace-nowrap" title={u.lastLoginAt ? formatDateTimeWIB(u.lastLoginAt) : undefined}>
                        {u.lastLoginAt ? timeAgo(u.lastLoginAt, now) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" onClick={() => setDialog({ kind: 'edit', user: u })} className="btn !px-2.5 !py-1 !text-xs">Edit</button>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: 'password', user: u })}
                            disabled={isSelf}
                            title={isSelf ? 'Change your own password under My account' : undefined}
                            className="btn !px-2.5 !py-1 !text-xs"
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: 'delete', user: u })}
                            disabled={isSelf || lastAdmin}
                            title={isSelf ? 'You cannot delete yourself' : lastAdmin ? 'Keep at least one active administrator' : undefined}
                            className="btn !px-2.5 !py-1 !text-xs hover:!text-flag"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-chalk-faint">
          Sign-ins are limited to 5 wrong passwords per username (15 minute lock). Deactivating a user, resetting their password or deleting them ends their sessions immediately.
        </p>
      </div>

      {dialog?.kind === 'create' && <CreateDialog onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <EditDialog user={dialog.user} isSelf={dialog.user.id === meId} onClose={close} onDone={done} />}
      {dialog?.kind === 'password' && <PasswordDialog user={dialog.user} onClose={close} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteDialog user={dialog.user} onClose={close} onDone={done} />}
    </div>
  )
}
