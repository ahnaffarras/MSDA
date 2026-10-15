/**
 * MSDA Dashboard — API client untuk backend Go (msda-backend).
 *
 * - Browser → /api-proxy/* (route handler Next.js: memverifikasi sesi login, lalu
 *   meneruskan ke backend dengan X-Internal-Token). Backend tidak pernah dipanggil
 *   langsung dari browser.
 * - Server → MSDA_BACKEND_URL dengan MSDA_INTERNAL_TOKEN.
 */

import { redirectToLogin } from "./admin-client";
import type {
  DashboardSummary, TopDomain, TopClient, LabGridAP,
  DNSInfo, DNSBlacklist, ClientAccessLog, ClientAccessStats,
  NotificationItem, NotificationCounts, NotificationStatus, NotificationSeverity, NotificationType, AIReport, PaginatedResponse, LabSeat,
} from "./types";

// ─────────────────────────────────────────── Base URL resolution ──────────────

function apiBase(): string {
  // Server (jarang dipakai): langsung ke backend dengan token internal.
  if (typeof window === "undefined") {
    return (process.env.MSDA_BACKEND_URL ?? "http://localhost:8080") + "/api/v1";
  }
  // Browser: selalu lewat proxy dashboard yang memverifikasi sesi login.
  return "/api-proxy/v1";
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${apiBase()}${path}`;
  const headers = new Headers(options.headers);
  if (typeof window === "undefined") {
    const token = process.env.MSDA_INTERNAL_TOKEN;
    if (token) headers.set("X-Internal-Token", token);
  } else {
    headers.set("accept", "application/json");
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin", ...options, headers });
  if (res.status === 401 && typeof window !== "undefined") {
    redirectToLogin(); // sesi habis → kembali ke halaman login
  }
  if (!res.ok) {
    // Pesan error diambil dari JSON bila ada; detail mentah tidak ditampilkan ke pengguna
    let message = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) message = j.error;
    } catch { /* bukan JSON */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────── Dashboard ───────────────────────

export async function fetchSummary(range: "today" | "7d" | "30d" = "today"): Promise<DashboardSummary> {
  const res = await apiFetch<{ data: DashboardSummary }>(`/dashboard/summary?range=${range}`);
  return res.data;
}

export async function fetchLabGrid(hours = 8): Promise<LabGridAP[]> {
  const res = await apiFetch<{ data: LabGridAP[] }>(`/dashboard/lab-grid?hours=${hours}`);
  return res.data;
}

export async function fetchTopDomains(opts: { type?: string; limit?: number; range?: string } = {}): Promise<TopDomain[]> {
  const params = new URLSearchParams();
  if (opts.type)  params.set("type",  opts.type);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.range) params.set("range", opts.range);
  const res = await apiFetch<{ data: TopDomain[] }>(`/dashboard/top-domains?${params}`);
  return res.data;
}

export async function fetchTopClients(opts: { limit?: number; range?: string } = {}): Promise<TopClient[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.range) params.set("range", opts.range);
  const res = await apiFetch<{ data: TopClient[] }>(`/dashboard/top-clients?${params}`);
  return res.data;
}

// ─────────────────────────────────────────── DNS Info ────────────────────────

export async function fetchDNSInfoList(opts: {
  type?: string; group?: string; search?: string; page?: number; limit?: number;
} = {}): Promise<PaginatedResponse<DNSInfo>> {
  const params = new URLSearchParams();
  if (opts.type)   params.set("type",   opts.type);
  if (opts.group)  params.set("group",  opts.group);
  if (opts.search) params.set("search", opts.search);
  if (opts.page)   params.set("page",   String(opts.page));
  if (opts.limit)  params.set("limit",  String(opts.limit));
  return apiFetch<PaginatedResponse<DNSInfo>>(`/dns-info?${params}`);
}

export async function fetchDNSInfoGroups(): Promise<string[]> {
  const res = await apiFetch<{ data: string[] }>("/dns-info/groups");
  return res.data;
}

export async function fetchDNSInfoTypes(): Promise<string[]> {
  const res = await apiFetch<{ data: string[] }>("/dns-info/types");
  return res.data;
}

export async function fetchDNSInfoDetail(domain: string): Promise<DNSInfo> {
  const res = await apiFetch<{ data: DNSInfo }>(`/dns-info/${encodeURIComponent(domain)}`);
  return res.data;
}

// ─────────────────────────────────────────── Blacklist ───────────────────────

export async function fetchBlacklist(opts: {
  type?: string; blocked_level?: string; is_active?: boolean; search?: string;
  page?: number; limit?: number;
} = {}): Promise<PaginatedResponse<DNSBlacklist>> {
  const params = new URLSearchParams();
  if (opts.type)          params.set("type",          opts.type);
  if (opts.blocked_level) params.set("blocked_level", opts.blocked_level);
  if (opts.is_active !== undefined) params.set("is_active", String(opts.is_active));
  if (opts.search) params.set("search", opts.search);
  if (opts.page)   params.set("page",   String(opts.page));
  if (opts.limit)  params.set("limit",  String(opts.limit));
  return apiFetch<PaginatedResponse<DNSBlacklist>>(`/blacklist?${params}`);
}

export async function createBlacklist(body: {
  blocked_level: string; domain?: string; group?: string; type: string; is_active?: boolean;
}): Promise<DNSBlacklist> {
  const res = await apiFetch<{ data: DNSBlacklist }>("/blacklist", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function updateBlacklist(id: string, body: Partial<DNSBlacklist>): Promise<DNSBlacklist> {
  const res = await apiFetch<{ data: DNSBlacklist }>(`/blacklist/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function toggleBlacklist(id: string): Promise<DNSBlacklist> {
  const res = await apiFetch<{ data: DNSBlacklist }>(`/blacklist/${id}/toggle-active`, {
    method: "PATCH",
  });
  return res.data;
}

export async function deleteBlacklist(id: string): Promise<void> {
  await apiFetch(`/blacklist/${id}`, {
    method: "DELETE",
  });
}

// ─────────────────────────────────────────── Client Access ───────────────────

export async function fetchClientAccess(opts: {
  domain?: string; client_ip?: string; group?: string; action?: string;
  ap_ip?: string; from?: string; to?: string; page?: number; limit?: number;
} = {}): Promise<PaginatedResponse<ClientAccessLog>> {
  const params = new URLSearchParams();
  Object.entries(opts).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)); });
  return apiFetch<PaginatedResponse<ClientAccessLog>>(`/client-access?${params}`);
}

export async function fetchClientAccessStats(range = "7d"): Promise<ClientAccessStats> {
  const res = await apiFetch<{ data: ClientAccessStats }>(`/client-access/stats?range=${range}`);
  return res.data;
}

export function clientAccessExportUrl(range = "today"): string {
  return `${apiBase()}/client-access/export?range=${range}&format=csv`;
}

// ─────────────────────────────────────────── Notifications ───────────────────

export interface NotificationQuery {
  page?: number;
  limit?: number;
  status?: NotificationStatus | "";
  severity?: NotificationSeverity | "";
  type_send?: NotificationType | "";
  from?: string; // ISO 8601
  to?: string;   // ISO 8601
  q?: string;
}

export async function fetchNotifications(query: NotificationQuery = {}): Promise<PaginatedResponse<NotificationItem>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 20));
  for (const k of ["status", "severity", "type_send", "from", "to", "q"] as const) {
    const v = query[k];
    if (v) params.set(k, v);
  }
  return apiFetch<PaginatedResponse<NotificationItem>>(`/notifications?${params}`);
}

export async function fetchUnreadSummary(): Promise<NotificationCounts> {
  const res = await apiFetch<{ data: NotificationCounts }>("/notifications/unread-count");
  return res.data;
}

export async function setNotificationStatus(id: string, status: NotificationStatus, note = ""): Promise<void> {
  await apiFetch(`/notifications/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });
}

export async function bulkSetNotificationStatus(ids: string[], status: NotificationStatus, note = ""): Promise<number> {
  const res = await apiFetch<{ data: { updated: number } }>("/notifications/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status, note }),
  });
  return res.data.updated;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read-all", { method: "PATCH" });
}

// ─────────────────────────────────────────── AI Reports ──────────────────────

export async function fetchReports(page = 1, limit = 10): Promise<PaginatedResponse<AIReport>> {
  return apiFetch<PaginatedResponse<AIReport>>(`/reports?page=${page}&limit=${limit}`);
}

// ─────────────────────────────────────────── Static seat map ─────────────────

export const ACCESS_POINTS = [
  { ap_ip: "192.168.10.1", ap_name: "Lab Komputer 1" },
  { ap_ip: "192.168.20.1", ap_name: "Lab Komputer 2" },
  { ap_ip: "192.168.30.1", ap_name: "Lab Komputer 3" },
];

export const LAB_SEATS: (LabSeat & { lab_id: number })[] = [
  ...Array.from({ length: 36 }, (_, i) => ({
    seat: i + 1, lab_id: 1,
    client_ip:     `192.168.10.${10 + i}`,
    student_label: `PC-${String(i + 1).padStart(2, "0")}`,
  })),
  ...Array.from({ length: 36 }, (_, i) => ({
    seat: i + 1, lab_id: 2,
    client_ip:     `192.168.20.${10 + i}`,
    student_label: `PC-${String(i + 1).padStart(2, "0")}`,
  })),
  ...Array.from({ length: 36 }, (_, i) => ({
    seat: i + 1, lab_id: 3,
    client_ip:     `192.168.30.${10 + i}`,
    student_label: `PC-${String(i + 1).padStart(2, "0")}`,
  })),
];

export function seatsForLab(labId: number) {
  return LAB_SEATS.filter((s) => s.lab_id === labId);
}
