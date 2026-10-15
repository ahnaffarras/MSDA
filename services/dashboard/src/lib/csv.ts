/**
 * Parser CSV kecil (RFC 4180): kolom ber-kutip, koma/baris-baru di dalam kutip, "" sebagai
 * kutip literal, CRLF/LF, BOM. Murni, tanpa dependensi.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // buang baris yang seluruhnya kosong
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

/** Baris pertama = header (huruf kecil, spasi dipangkas). Mengembalikan objek per baris + nomor baris sumber. */
export function csvToObjects(text: string): { headers: string[]; rows: { line: number; values: Record<string, string> }[] } {
  const all = parseCsv(text)
  if (all.length === 0) return { headers: [], rows: [] }
  const headers = all[0].map(h => h.trim().toLowerCase())
  const rows = all.slice(1).map((cells, idx) => ({
    line: idx + 2,
    values: Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
  }))
  return { headers, rows }
}
