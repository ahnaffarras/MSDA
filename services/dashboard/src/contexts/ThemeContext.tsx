'use client'

import { createContext, useCallback, useContext, useSyncExternalStore, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'msda-theme'

/**
 * Sumber kebenaran tema adalah class di <html>. Class itu dipasang oleh script
 * kecil di layout.tsx sebelum React hydrate (tanpa kedip), lalu dibaca di sini.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
const getSnapshot = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
const getServerSnapshot = (): Theme => 'light'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggleTheme = useCallback(() => {
    const next: Theme = getSnapshot() === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage diblokir (mode privat) — tema tetap berlaku untuk sesi ini */
    }
  }, [])

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    return { theme: 'light' as Theme, toggleTheme: () => {} }
  }
  return context
}
