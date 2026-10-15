'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/admin-client'
import { BLACKLIST_TYPES, isEffective, isKnownType, matchesBlacklist, type BlacklistEntry } from '@/lib/blacklist'
import { useLoad } from '@/lib/useLoad'

/** Daftar blokir aktif, untuk menandai domain yang sudah diblokir di halaman lain. */
export function useBlocklist() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([])

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/blacklist')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setEntries(data)
    } catch (e) {
      console.error('Failed to load blocklist:', e)
    }
  }, [])
  useLoad(reload)

  /** Entri aktif yang memblokir domain ini (domain sama atau induknya), kalau ada. */
  const find = useCallback(
    (domain: string) => entries.find(e => isEffective(e) && matchesBlacklist(domain, e.domain)),
    [entries],
  )
  return { entries, find, reload }
}

interface Props {
  domain: string
  /** kategori awal yang disarankan (dari log / hasil analisis AI) */
  suggestedType?: string
  suggestedGroup?: string
  onBlocked?: () => void
  /** tampilan tombol: teks lengkap atau ikon saja (untuk baris padat) */
  compact?: boolean
}

export default function BlockDomainButton({ domain, suggestedType, suggestedGroup, onBlocked, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(suggestedType && isKnownType(suggestedType) ? suggestedType : 'custom')
  const [group, setGroup] = useState(suggestedGroup ?? '')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const firstField = useRef<HTMLSelectElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setDone(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    firstField.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await adminFetch('/api/blacklist', {
        method: 'POST',
        body: JSON.stringify({ domain, type, group: group.trim() || undefined, description }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setError('Only administrators can block domains.')
        return
      }
      if (res.status === 409) {
        setDone(true)
        setError(null)
        onBlocked?.()
        return
      }
      if (!res.ok) {
        setError(data?.error ?? 'Failed to block the domain.')
        return
      }
      setDone(true)
      onBlocked?.()
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        title={`Block ${domain}`}
        aria-label={`Block ${domain}`}
        className={`inline-flex items-center gap-1.5 rounded-md border border-line text-chalk-dim hover:text-flag hover:border-flag-border hover:bg-flag-bg ${
          compact ? 'p-1.5' : 'px-3 py-1.5 text-sm font-medium'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M5.6 5.6l12.8 12.8" />
        </svg>
        {!compact && 'Block'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center p-0 sm:p-4" role="presentation">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgb(0 0 0 / 0.55)' }} onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="block-title"
            className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-line bg-surface p-5 shadow-2xl max-h-[90dvh] overflow-y-auto"
          >
            {done ? (
              <div>
                <h2 id="block-title" className="text-lg font-semibold text-chalk">Domain blocked</h2>
                <p className="mt-2 text-sm text-chalk-dim">
                  <span className="font-mono text-chalk break-all">{domain}</span> was added to the blocklist. The n8n workflow
                  will apply this rule on the next DNS check.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 justify-end">
                  <Link href="/blacklist" className="px-3 py-2 text-sm font-medium text-primary underline underline-offset-4">
                    Open blocklist
                  </Link>
                  <button type="button" onClick={close} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 id="block-title" className="text-lg font-semibold text-chalk">Block domain</h2>
                <p className="mt-1 font-mono text-sm text-chalk break-all">{domain}</p>
                <p className="mt-2 text-sm text-chalk-faint">
                  Its subdomains are blocked too (e.g. <span className="font-mono">cdn.{domain}</span>).
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-chalk">Category</span>
                    <select
                      ref={firstField}
                      value={type}
                      onChange={e => setType(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-chalk"
                    >
                      {BLACKLIST_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-chalk">Group <span className="font-normal text-chalk-faint">(optional)</span></span>
                    <input
                      value={group}
                      onChange={e => setGroup(e.target.value)}
                      placeholder={BLACKLIST_TYPES.find(t => t.value === type)?.group}
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-chalk placeholder-chalk-faint"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-chalk">Reason <span className="font-normal text-chalk-faint">(optional)</span></span>
                    <input
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      maxLength={300}
                      placeholder="e.g. used by students during class"
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-chalk placeholder-chalk-faint"
                    />
                  </label>
                </div>

                {error && (
                  <p role="alert" className="mt-3 rounded-lg border border-flag-border bg-flag-bg px-3 py-2 text-sm text-flag">
                    {error}
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={close} className="px-4 py-2 rounded-lg text-sm font-medium text-chalk-dim hover:bg-surface-2">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-flag text-background disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Block domain'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
