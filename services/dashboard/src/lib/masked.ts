/** True bila nilai adalah IP yang sudah disamarkan (lihat lib/privacy.ts). Aman dipakai di browser. */
export const isMaskedIp = (v: string) => /x·[0-9a-f]{6}$/.test(v)
