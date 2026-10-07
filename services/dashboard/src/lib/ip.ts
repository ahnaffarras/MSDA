/**
 * Urutan IP yang benar untuk manusia.
 *
 * Perbandingan string biasa mengurutkan "192.168.1.12" sebelum "192.168.1.3".
 * Di sini tiap oktet dibandingkan sebagai angka, jadi hasilnya
 * 192.168.1.3, 192.168.1.4, 192.168.1.8, 192.168.1.12.
 *
 * Alamat yang bukan IPv4 valid (kosong, IPv6, teks) diletakkan di akhir
 * dan diurutkan sebagai teks supaya hasilnya tetap stabil.
 */
function ipv4ToNumber(ip: string): number | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

export function compareIp(a: string, b: string): number {
  const na = ipv4ToNumber(a)
  const nb = ipv4ToNumber(b)
  if (na !== null && nb !== null) return na - nb
  if (na !== null) return -1
  if (nb !== null) return 1
  return a.localeCompare(b)
}

export function sortByIp<T>(items: readonly T[], getIp: (item: T) => string, direction: 'asc' | 'desc' = 'asc'): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...items].sort((x, y) => sign * compareIp(getIp(x), getIp(y)))
}
