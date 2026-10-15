'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Dialog kecil: Esc / klik latar menutup, fokus awal ke elemen interaktif pertama. */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
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
