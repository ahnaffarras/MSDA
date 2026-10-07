import Link from 'next/link'
import type { ReactNode } from 'react'

export interface Crumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Breadcrumb trail shown above the title. Last item is the current page. */
  crumbs?: Crumb[]
  /** Free-form row above the title (status chips, dates). Used instead of crumbs. */
  eyebrow?: ReactNode
  /** Right-aligned controls (buttons, range switcher). */
  actions?: ReactNode
  /** Extra row inside the header band (badges, summary strip, tabs). */
  children?: ReactNode
}

/**
 * One header for every page: same band, same spacing, same colors in light and dark.
 * The band uses the card surface so it never reads as a different shade than the panels below it.
 */
export default function PageHeader({ title, description, crumbs, eyebrow, actions, children }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-x py-5 md:py-6">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-chalk-faint">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1
              return (
                <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5 min-w-0">
                  {c.href && !last ? (
                    <Link href={c.href} className="hover:text-primary truncate">{c.label}</Link>
                  ) : (
                    <span className={last ? 'text-chalk-dim font-medium truncate' : 'truncate'} aria-current={last ? 'page' : undefined}>
                      {c.label}
                    </span>
                  )}
                  {!last && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-line-strong" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  )}
                </span>
              )
            })}
          </nav>
        )}
        {eyebrow && <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-chalk-faint">{eyebrow}</div>}

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="page-title min-w-0">
            <h1 className="text-2xl md:text-[1.75rem] leading-tight font-semibold tracking-tight text-chalk break-words">{title}</h1>
            {description && <p className="mt-1.5 text-sm text-chalk-dim max-w-[70ch]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>

        {children}
      </div>
    </header>
  )
}

/** Shared segmented control (time range, filters) so every page's switcher looks identical. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map(o => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} className="seg-btn">
          {o.label}
        </button>
      ))}
    </div>
  )
}
