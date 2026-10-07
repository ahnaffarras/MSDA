'use client'

/** Arahkan ke halaman login (membawa halaman sekarang sebagai ?next=). */
export function redirectToLogin() {
  if (typeof window === 'undefined') return
  const here = window.location.pathname + window.location.search
  // Navigasi penuh disengaja: membuang state klien milik sesi yang sudah habis
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(here)}`)
}

/**
 * fetch untuk aksi tulis. Sesi dibawa otomatis oleh cookie HttpOnly (tidak ada token
 * yang disimpan di browser). 401 = sesi habis → kembali ke login.
 * 403 dikembalikan apa adanya supaya pemanggil bisa menampilkan pesannya.
 */
export async function adminFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const res = await fetch(url, { ...init, headers, credentials: 'same-origin' })
  if (res.status === 401) redirectToLogin()
  return res
}
