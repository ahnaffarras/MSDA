import type { RiskLevel } from '@/lib/domain-risk'

const LABEL: Record<RiskLevel, string> = {
  safe: 'Normal',
  watch: 'Needs attention',
  flag: 'Risky',
}

export function asRisk(level: string | undefined): RiskLevel {
  return level === 'flag' || level === 'watch' ? level : 'safe'
}

/**
 * Penanda risiko. Bentuk berbeda per level (lingkaran / segitiga / belah ketupat)
 * supaya tidak hanya bergantung pada warna — terbaca juga untuk buta warna.
 */
export function RiskMark({ level, className = 'w-3 h-3' }: { level: string; className?: string }) {
  const l = asRisk(level)
  const color = `var(--accent-${l === 'safe' ? 'safe' : l === 'watch' ? 'watch' : 'flag'})`
  return (
    <svg className={`${className} flex-shrink-0`} viewBox="0 0 12 12" aria-hidden="true">
      {l === 'safe' && <circle cx="6" cy="6" r="4.5" fill={color} />}
      {l === 'watch' && <path d="M6 1.2L11.2 10.4H0.8z" fill={color} />}
      {l === 'flag' && <path d="M6 0.8L11.2 6L6 11.2L0.8 6z" fill={color} />}
    </svg>
  )
}

export function RiskBadge({ level, compact = false }: { level: string; compact?: boolean }) {
  const l = asRisk(level)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium border whitespace-nowrap"
      style={{
        color: `var(--accent-${l})`,
        backgroundColor: `var(--accent-${l}-bg)`,
        borderColor: `var(--accent-${l}-border)`,
      }}
    >
      <RiskMark level={l} className="w-2.5 h-2.5" />
      {!compact && LABEL[l]}
      {compact && <span className="sr-only">{LABEL[l]}</span>}
    </span>
  )
}
