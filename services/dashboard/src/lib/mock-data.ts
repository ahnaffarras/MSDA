import type { DnsEvent, LabSeat } from "./types";

/**
 * MOCK DATA — stand-in for the real feed.
 *
 * Once the backend exposes events (e.g. read from the MongoDB collection
 * n8n writes to), replace `MOCK_EVENTS` with a fetch/query that returns
 * `DnsEvent[]` in this same shape. Nothing else in the dashboard needs to
 * change — components consume `DnsEvent`/`LabSeat`, not this file directly.
 */

export const ACCESS_POINTS = [
  { ap_ip: "192.168.10.1", ap_name: "Lab Komputer 1" },
  { ap_ip: "192.168.20.1", ap_name: "Lab Komputer 2" },
  { ap_ip: "192.168.30.1", ap_name: "Lab Komputer 3" },
];

// 3 lab × 36 PC = 108 kursi — layout 6 kolom × 6 baris per lab.
export const LAB_SEATS: (LabSeat & { lab_id: number })[] = [
  ...Array.from({ length: 36 }, (_, i) => ({
    seat: i + 1, lab_id: 1,
    client_ip: `192.168.10.${10 + i}`,
    student_label: `PC-${String(i + 1).padStart(2, "0")}`,
  })),
  ...Array.from({ length: 36 }, (_, i) => ({
    seat: i + 1, lab_id: 2,
    client_ip: `192.168.20.${10 + i}`,
    student_label: `PC-${String(i + 1).padStart(2, "0")}`,
  })),
  ...Array.from({ length: 36 }, (_, i) => ({
    seat: i + 1, lab_id: 3,
    client_ip: `192.168.30.${10 + i}`,
    student_label: `PC-${String(i + 1).padStart(2, "0")}`,
  })),
];

const DOMAIN_POOL = [
  "wikipedia.org",
  "docs.google.com",
  "ruangguru.com",
  "youtube.com",
  "github.com",
  "kemdikbud.go.id",
  "tiktok.com",
  "stackoverflow.com",
  "instagram.com",
  "quipper.com",
  "roblox.com",
  "duolingo.com",
  "office.com",
  "steam.com",
  "discord.com",
];

// Deterministic pseudo-random so the same seat/time always yields the same
// domain — avoids server/client hydration mismatches from Math.random().
function pick<T>(arr: T[], seed: number): T {
  const idx = Math.abs(Math.sin(seed) * 10000) % arr.length;
  return arr[Math.floor(idx)];
}

const BASE_TIME = new Date("2026-08-18T02:30:00.000Z").getTime(); // 09:30 WIB

export const MOCK_EVENTS: DnsEvent[] = Array.from({ length: 108 }, (_, i) => {
  const labId    = (i % 3) + 1;
  const labSeats = LAB_SEATS.filter((s) => s.lab_id === labId);
  const seatIndex = i % labSeats.length;
  const seat = labSeats[seatIndex];
  const ap   = ACCESS_POINTS[labId - 1];
  const domain = pick(DOMAIN_POOL, seatIndex * 3.1 + i * 0.7);
  const secondsAgo = i * 12;
  const ts = new Date(BASE_TIME - secondsAgo * 1000).toISOString();
  return {
    timestamp:   ts,
    source_type: "mikrotik_dns" as const,
    ap_ip:       ap.ap_ip,
    ap_name:     ap.ap_name,
    client_ip:   seat.client_ip,
    domain,
    risk_level:  "safe",
    ingested_at: ts,
  };
}).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

/** Latest event per client_ip — what the seating grid renders per seat. */
export function latestEventBySeat(events: DnsEvent[]): Map<string, DnsEvent> {
  const map = new Map<string, DnsEvent>();
  for (const ev of events) {
    if (!map.has(ev.client_ip)) map.set(ev.client_ip, ev);
  }
  return map;
}

export function topDomains(events: DnsEvent[], limit = 5) {
  const counts = new Map<string, number>();
  for (const ev of events) counts.set(ev.domain, (counts.get(ev.domain) ?? 0) + 1);
  const total = events.length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count, share: Math.round((count / total) * 100) }));
}
