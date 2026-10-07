'use client'

import { ReactNode, useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import Sidebar, { BrandMark } from '@/components/Sidebar'

function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  return theme === 'dark' ? (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.35 15.35A9 9 0 0 1 8.65 3.65 9 9 0 1 0 20.35 15.35z" />
    </svg>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  // Drawer dianggap terbuka hanya selama masih di halaman tempat ia dibuka,
  // jadi otomatis tertutup saat pindah halaman (termasuk tombol back).
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const menuOpen = openedOn === pathname
  const setMenuOpen = useCallback((v: boolean) => setOpenedOn(v ? pathname : null), [pathname])
  const closeMenu = useCallback(() => setOpenedOn(null), [])

  // Esc menutup drawer, dan scroll halaman dikunci selama drawer terbuka
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen, setMenuOpen])

  return (
    <div className="flex min-h-screen min-h-dvh">
      <Sidebar open={menuOpen} onClose={closeMenu} />

      {/* min-w-0: tanpa ini tabel lebar di dalam flex item melebarkan seluruh halaman */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/*
          Top bar mobile. Ini bagian dari alur halaman (sticky, bukan tombol melayang),
          jadi konten tidak pernah lewat di belakang tombol menu.
        */}
        <header
          className="rail lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-3 border-b shadow-sm"
        >
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="sata-sidebar"
            className="rail-link flex items-center justify-center w-10 h-10 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
          <BrandMark className="w-8 h-8" />
          <span className="font-bold tracking-tight text-lg" style={{ color: 'var(--rail-strong)' }}>SATA</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rail-link ml-auto flex items-center justify-center w-10 h-10 rounded-lg"
          >
            <ThemeIcon theme={theme} />
          </button>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  )
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // Halaman login tampil polos: tanpa sidebar, tanpa memanggil API yang butuh sesi
  const bare = pathname === '/login'
  return (
    <ThemeProvider>
      <AuthProvider>{bare ? children : <Shell>{children}</Shell>}</AuthProvider>
    </ThemeProvider>
  )
}
