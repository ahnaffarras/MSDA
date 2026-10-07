'use client'

import { useState, type FormEvent } from 'react'
import PageHeader from '@/components/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { PASSWORD_MIN, ROLE_LABEL, ROLE_HINT, validatePassword } from '@/lib/auth-types'
import { adminFetch } from '@/lib/admin-client'
import { formatDateTimeWIB } from '@/lib/format'

const field =
  'mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none'

export default function AccountPage() {
  const { user, loading, logout, refresh } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'safe' | 'flag'; text: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || busy) return
    setNotice(null)
    const problem = validatePassword(next, user.username)
    if (problem) return setNotice({ tone: 'flag', text: problem })
    if (next !== again) return setNotice({ tone: 'flag', text: 'The two new passwords do not match.' })

    setBusy(true)
    try {
      const res = await adminFetch('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return setNotice({ tone: 'flag', text: data?.error ?? 'Could not change the password.' })
      setCurrent('')
      setNext('')
      setAgain('')
      setNotice({ tone: 'safe', text: 'Password changed. Your other signed-in devices were signed out.' })
      void refresh()
    } catch {
      setNotice({ tone: 'flag', text: 'Could not reach the server. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <PageHeader
        crumbs={[{ label: 'Dashboard', href: '/' }, { label: 'My account' }]}
        title="My account"
        description="Your sign-in details and password."
        actions={
          <button type="button" onClick={() => void logout()} className="btn">
            Sign out
          </button>
        }
      />

      <div className="page-x py-6 md:py-8 grid gap-6 lg:grid-cols-2 items-start">
        <section className="rounded-xl border border-line bg-surface p-4 md:p-6 space-y-4" aria-labelledby="profile-h">
          <h2 id="profile-h" className="text-base font-semibold text-chalk">Profile</h2>
          {loading || !user ? (
            <p className="text-sm text-chalk-dim">Loading…</p>
          ) : (
            <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
              <dt className="text-chalk-faint">Name</dt>
              <dd className="text-chalk font-medium">{user.displayName}</dd>
              <dt className="text-chalk-faint">Username</dt>
              <dd className="text-chalk font-mono">{user.username}</dd>
              <dt className="text-chalk-faint">Role</dt>
              <dd className="text-chalk">
                <span className="font-medium">{ROLE_LABEL[user.role]}</span>
                <span className="block text-xs text-chalk-dim mt-0.5">{ROLE_HINT[user.role]}</span>
              </dd>
              <dt className="text-chalk-faint">Last sign-in</dt>
              <dd className="text-chalk">{user.lastLoginAt ? formatDateTimeWIB(user.lastLoginAt) : '—'}</dd>
            </dl>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4 md:p-6" aria-labelledby="pw-h">
          <h2 id="pw-h" className="text-base font-semibold text-chalk">Change password</h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-chalk">Current password</span>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required className={field} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-chalk">New password</span>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" required minLength={PASSWORD_MIN} className={field} />
              <span className="mt-1 block text-xs text-chalk-faint">At least {PASSWORD_MIN} characters. A short sentence works well.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-chalk">Repeat new password</span>
              <input type="password" value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password" required className={field} />
            </label>

            {notice && (
              <p
                role={notice.tone === 'flag' ? 'alert' : 'status'}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  notice.tone === 'safe' ? 'border-safe-border bg-safe-bg text-safe' : 'border-flag-border bg-flag-bg text-flag'
                }`}
              >
                {notice.text}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !current || !next || !again}
              className="btn !bg-primary !text-on-primary !border-transparent hover:!bg-primary-hover font-semibold"
            >
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
