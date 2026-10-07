'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL } from '@/lib/auth-types'
import type { Group, Node } from '@/lib/types'

interface SidebarProps {
  /** Drawer terbuka (hanya berlaku di layar kecil) */
  open: boolean
  onClose: () => void
}

const icons = {
  home: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  manage: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',
  network: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01',
  block: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8',
  intel: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M11 8v6M8 11h6',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  client: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6zM21 19v-1a4 4 0 00-3-3.900M16 4.100a3 3 0 010 5.8',
  report: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  bell: 'M6 9a6 6 0 1112 0c0 5 2 6 2 7H4c0-1 2-2 2-7zM10 20a2 2 0 004 0',
  storage: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2m0 16v2M4.9 4.900l1.4 1.400m11.4 11.400l1.4 1.400M2 12h2m16 0h2M4.9 19.100l1.4-1.400M17.7 6.300l1.4-1.4',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6zM17 11l2 2 3-3.500',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h11',
  moon: 'M20.350 15.350A9 9 0 018.650 3.650 9 9 0 1020.350 15.350z',
}

/** Tiga node yang terhubung — penanda "jaringan", bukan inisial teks. */
export function BrandMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <span
      className={`brand-mark grid place-items-center rounded-xl flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#ffffff" strokeWidth={1.7} strokeLinecap="round">
        <path d="M12 6.5v5.2M12 11.7l-5.2 4.6M12 11.7l5.2 4.6" />
        <circle cx="12" cy="5" r="2.2" fill="#ffffff" />
        <circle cx="6" cy="17" r="2.2" />
        <circle cx="18" cy="17" r="2.2" />
      </svg>
    </span>
  )
}

function Icon({ d, size = 'w-5 h-5' }: { d: string; size?: string }) {
  return (
    <svg className={`${size} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { user, isAdmin, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [nodes, setNodes] = useState<Node[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [g, n] = await Promise.all([fetch('/api/groups'), fetch('/api/nodes')])
        const gData = g.ok ? await g.json() : []
        const nData = n.ok ? await n.json() : []
        if (cancelled) return
        // API mengembalikan objek { error } saat gagal — jangan sampai .map() crash
        setGroups(Array.isArray(gData) ? gData : [])
        setNodes(Array.isArray(nData) ? nData : [])
      } catch (error) {
        console.error('Failed to fetch sidebar data:', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isActive = (path: string) => pathname === path
  // `collapsed` hanya berlaku di desktop; drawer mobile selalu menampilkan label penuh
  const hideLabel = collapsed ? 'lg:hidden' : ''

  const itemClass = `rail-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${collapsed ? 'lg:justify-center' : ''}`

  const navLink = ({ href, label, icon, active, title }: { href: string; label: string; icon: string; active: boolean; title?: string }) => (
    <Link
      href={href}
      onClick={onClose}
      title={title ?? label}
      aria-current={active ? 'page' : undefined}
      data-active={active}
      className={itemClass}
    >
      <Icon d={icon} />
      <span className={`truncate ${hideLabel}`}>{label}</span>
    </Link>
  )

  const sectionLabel = (children: ReactNode) => (
    <p className={`rail-label px-3 pt-6 pb-2 font-semibold ${hideLabel}`}>{children}</p>
  )

  return (
    <>
      {/* Latar belakang drawer (mobile) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 backdrop-blur-[2px]"
          style={{ backgroundColor: 'var(--rail-scrim)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="sata-sidebar"
        aria-label="Main navigation"
        className={`
          rail
          fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]
          lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:max-w-none lg:flex-shrink-0
          ${collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64'}
          flex flex-col border-r shadow-xl lg:shadow-none
          transition-transform duration-200 ease-out lg:transition-[width]
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div
          className={`flex items-center h-16 px-4 border-b flex-shrink-0 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
          style={{ borderColor: 'var(--rail-line)' }}
        >
          <Link href="/" onClick={onClose} className="flex items-center gap-3 min-w-0" title="SATA — Dashboard">
            <BrandMark />
            <span className={`min-w-0 ${hideLabel}`}>
              <span className="block text-base font-bold leading-tight tracking-tight" style={{ color: 'var(--rail-strong)' }}>SATA</span>
              <span className="block text-xs leading-tight truncate" style={{ color: 'var(--rail-dim)' }}>
                Smart AP Traffic Analyzer
              </span>
            </span>
          </Link>

          {/* Tutup drawer (mobile) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rail-link lg:hidden ml-auto w-10 h-10 grid place-items-center rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Navigasi */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <div className="space-y-0.5">
            {navLink({ href: "/",  label: "Dashboard",  icon: icons.home,  active: isActive('/') })}
            {navLink({ href: "/settings",  label: "Network Management",  icon: icons.manage,  active: isActive('/settings') })}
          </div>

          {groups.length > 0 && sectionLabel('Classes & rooms')}
          <div className="space-y-0.5">
            {groups.map(group => {
              const groupPath = `/networks/${group.id}`
              const groupNodes = nodes.filter(n => n.group_id === group.id)
              const inGroup = pathname === groupPath || pathname.startsWith(`${groupPath}/`)
              return (
                <div key={group.id}>
                  <Link
                    href={groupPath}
                    onClick={onClose}
                    title={group.name}
                    aria-current={pathname === groupPath ? 'page' : undefined}
                    data-active={pathname === groupPath || (inGroup && collapsed)}
                    className={`${itemClass} justify-between`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon d={icons.network} />
                      <span className={`truncate ${hideLabel}`}>{group.name}</span>
                    </span>
                    {groupNodes.length > 0 && (
                      <span className={`rail-count text-xs font-medium tabular-nums px-1.5 rounded ${hideLabel}`}>
                        {groupNodes.length}
                      </span>
                    )}
                  </Link>

                  {/* AP di dalam kelas — tampil saat kelas sedang dibuka */}
                  {inGroup && groupNodes.length > 0 && (
                    <ul className={`ml-[1.65rem] mt-0.5 mb-1 pl-3 border-l space-y-0.5 ${hideLabel}`} style={{ borderColor: 'var(--rail-line)' }}>
                      {groupNodes.map(node => {
                        const nodePath = `${groupPath}/nodes/${node.id}`
                        const active = pathname === nodePath
                        return (
                          <li key={node.id}>
                            <Link
                              href={nodePath}
                              onClick={onClose}
                              aria-current={active ? 'page' : undefined}
                              data-active={active}
                              className={`rail-sub block truncate rounded-md px-2.5 py-1.5 text-sm ${active ? 'font-semibold' : ''}`}
                            >
                              {node.name}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>

          {sectionLabel('DNS analysis')}
          <div className="space-y-0.5">
            {navLink({ href: "/dns-intelligence",  label: "DNS Intelligence",  icon: icons.intel,  active: isActive('/dns-intelligence') })}
            {navLink({ href: "/client-access",  label: "Client Access",  icon: icons.client,  active: isActive('/client-access') })}
            {navLink({ href: "/dns-info",  label: "Domain Info",  icon: icons.info,  active: isActive('/dns-info') })}
            {navLink({ href: "/blacklist",  label: "Blocklist",  icon: icons.block,  active: isActive('/blacklist') })}
          </div>

          {sectionLabel('Reports')}
          <div className="space-y-0.5">
            {navLink({ href: "/reports",  label: "Daily Reports",  icon: icons.report,  active: isActive('/reports') })}
            {navLink({ href: "/notifications",  label: "Notifications",  icon: icons.bell,  active: isActive('/notifications') })}
          </div>

          {sectionLabel('System')}
          <div className="space-y-0.5">
            {navLink({ href: "/storage",  label: "Storage & Cleanup",  icon: icons.storage,  active: isActive('/storage') })}
            {isAdmin && navLink({ href: "/users",  label: "Users & Access",  icon: icons.users,  active: isActive('/users') })}
          </div>
        </nav>

        {/* Footer ringkas: akun + keluar (satu baris), tema + ciutkan (satu baris) */}
        <div className="flex-shrink-0 px-3 py-2.5 border-t space-y-1.5" style={{ borderColor: 'var(--rail-line)' }}>
          {user && (
            <div className={`flex items-center gap-1 ${collapsed ? 'lg:flex-col' : ''}`}>
              <Link
                href="/account"
                onClick={onClose}
                title={`${user.displayName} — My account`}
                aria-current={isActive('/account') ? 'page' : undefined}
                data-active={isActive('/account')}
                className={`rail-link flex items-center gap-2.5 rounded-lg px-2 py-1.5 min-w-0 flex-1 ${collapsed ? 'lg:flex-none lg:justify-center lg:p-1.5' : ''}`}
              >
                <span
                  className="grid place-items-center w-8 h-8 rounded-full flex-shrink-0 text-xs font-bold"
                  style={{ background: 'var(--rail-chip)', color: 'var(--rail-strong)' }}
                  aria-hidden="true"
                >
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </span>
                <span className={`min-w-0 ${hideLabel}`}>
                  <span className="block truncate text-sm font-semibold leading-tight">{user.displayName}</span>
                  <span className="block truncate text-xs leading-tight" style={{ color: 'var(--rail-dim)' }}>
                    {/* hindari tulisan ganda ("Administrator / Administrator") */}
                    {user.displayName.trim().toLowerCase() === ROLE_LABEL[user.role].toLowerCase()
                      ? `@${user.username}`
                      : ROLE_LABEL[user.role]}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                className="rail-link grid place-items-center w-9 h-9 rounded-lg flex-shrink-0"
              >
                <Icon d={icons.logout} size="w-[18px] h-[18px]" />
              </button>
            </div>
          )}

          <div className={`flex items-center justify-between gap-2 ${collapsed ? 'lg:flex-col lg:justify-center' : ''}`}>
            {/* Sakelar terang / gelap: hanya ikon, ringkas */}
            {/* dibungkus div: .rail-seg punya display:flex sendiri sehingga lg:hidden tidak berlaku di elemen itu */}
            <div className={collapsed ? 'lg:hidden' : ''}>
            <div className="rail-seg" role="group" aria-label="Color theme">
              <button
                type="button"
                className="rail-seg-btn !px-3"
                aria-pressed={theme === 'light'}
                aria-label="Light mode"
                title="Light mode"
                onClick={() => theme !== 'light' && toggleTheme()}
              >
                <Icon d={icons.sun} size="w-4 h-4" />
              </button>
              <button
                type="button"
                className="rail-seg-btn !px-3"
                aria-pressed={theme === 'dark'}
                aria-label="Dark mode"
                title="Dark mode"
                onClick={() => theme !== 'dark' && toggleTheme()}
              >
                <Icon d={icons.moon} size="w-4 h-4" />
              </button>
            </div>
            </div>
            {/* Sidebar diciutkan (desktop): satu tombol ikon */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`${collapsed ? 'hidden lg:grid' : 'hidden'} rail-link place-items-center w-9 h-9 rounded-lg`}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon d={theme === 'dark' ? icons.sun : icons.moon} />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(c => !c)}
              className="hidden lg:grid rail-link place-items-center w-9 h-9 rounded-lg"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
            >
              <svg className={`w-5 h-5 flex-shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}