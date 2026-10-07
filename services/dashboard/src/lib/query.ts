/**
 * Helper kecil untuk route API yang membaca koleksi `ip_access_dns`.
 */
import { riskLevelFromType, type RiskLevel } from "@/lib/domain-risk";

/**
 * Filter waktu "N jam terakhir".
 * `timestamp` bisa tersimpan sebagai Date (n8n Mongo node) atau string ISO
 * (sesuai data-struktur/STRUCTURE.md), jadi keduanya dicocokkan.
 */
export function sinceFilter(hours: number) {
  const from = new Date(Date.now() - hours * 3600 * 1000);
  return {
    $or: [
      { timestamp: { $gte: from } },
      { timestamp: { $gte: from.toISOString() } },
    ],
  };
}

/** Parse angka query-string dengan batas aman. */
export function intParam(value: string | null, fallback: number, min: number, max: number) {
  const n = parseInt(value ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Escape input pengguna sebelum dipakai di RegExp (cegah regex injection / ReDoS). */
export function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tingkat risiko satu event.
 * Dokumen `ip_access_dns` tidak punya `risk_level`, jadi diturunkan:
 * diblokir → flag, selain itu dari kategori (`type`) domain.
 */
export function riskOf(doc: { risk_level?: string; action?: string; type?: string }): RiskLevel {
  if (doc.risk_level === "flag" || doc.risk_level === "watch" || doc.risk_level === "safe") {
    return doc.risk_level;
  }
  if (doc.action === "blocked") return "flag";
  return riskLevelFromType(doc.type ?? "");
}

const RANK: Record<RiskLevel, number> = { safe: 0, watch: 1, flag: 2 };
export function worstRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[a] >= RANK[b] ? a : b;
}
