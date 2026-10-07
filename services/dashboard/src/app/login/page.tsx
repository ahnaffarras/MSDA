'use client'

import { Suspense, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { BrandMark } from '@/components/Sidebar'
import { useTheme } from '@/contexts/ThemeContext'
import { safeNextPath } from '@/lib/auth-types'

function LoginForm() {
  const params = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const { theme, toggleTheme } = useTheme()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Could not sign in. Please try again.')
        setPassword('')
        return
      }
      // Navigasi penuh supaya seluruh state klien dimuat ulang dengan sesi baru
      window.location.assign(next)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative min-h-screen min-h-dvh grid place-items-center px-4 py-10">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="btn absolute top-4 right-4 !px-2.5 !py-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          {theme === 'dark' ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.35 15.35A9 9 0 0 1 8.65 3.65 9 9 0 1 0 20.35 15.35z" />
          )}
        </svg>
      </button>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <BrandMark className="w-12 h-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-chalk">Sign in to SATA</h1>
          <p className="mt-1 text-sm text-chalk-dim">Smart AP Traffic Analyzer</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-line bg-surface p-5 md:p-6 space-y-4 chalk-surface"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {error && (
            <p role="alert" className="rounded-lg border border-flag-border bg-flag-bg px-3 py-2 text-sm text-flag">
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-sm font-medium text-chalk">Username</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              maxLength={64}
              className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-chalk">Password</span>
            <div className="relative mt-1">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                maxLength={128}
                className="w-full rounded-lg border border-line bg-surface-2 pl-3 pr-16 py-2 text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                aria-pressed={show}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-chalk-dim hover:text-chalk"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="btn w-full !bg-primary !text-on-primary !border-transparent hover:!bg-primary-hover !py-2.5 font-semibold"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-chalk-faint">
          Forgot your password? Ask an administrator to reset it.
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
