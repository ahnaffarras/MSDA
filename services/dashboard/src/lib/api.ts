/**
 * SATA Dashboard — API client
 *
 * Semua fetch diarahkan ke Go backend API (sata-ai-backend).
 * - Server Component / Node.js → NEXT_PUBLIC_API_URL (e.g. http://backend:8080)
 * - Browser                    → /api-proxy/* (Next.js rewrites → Go backend)
 */

import type {
  DashboardSummary, TopDomain, TopClient, LabGridAP,
  DNSInfo, DNSBlacklist, ClientAccessLog, ClientAccessStats,
  NotificationItem, AIReport, PaginatedResponse, LabSeat,
} from "./types";

// ─────────────────────────────────────────── Base URL resolution ──────────────

function apiBase(): string {
  if (typeof window === "undefined") {
    return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080") + "/api/v1";
  }
  return "/api-proxy/v1";
}

function getToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("sata_token") ?? "";
  }
  return "";
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, { cache: "no-store", ...options });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[SATA API] ${path} → ${res.status}: ${body}`);
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
  return apiFetch<PaginatedResponse<DNSBlacklist>>(`/blacklist?${params}`, {
    headers: authHeaders(),
  });
}

export async function createBlacklist(body: {
  blocked_level: string; domain?: string; group?: string; type: string; is_active?: boolean;
}): Promise<DNSBlacklist> {
  const res = await apiFetch<{ data: DNSBlacklist }>("/blacklist", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function updateBlacklist(id: string, body: Partial<DNSBlacklist>): Promise<DNSBlacklist> {
  const res = await apiFetch<{ data: DNSBlacklist }>(`/blacklist/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function toggleBlacklist(id: string): Promise<DNSBlacklist> {
  const res = await apiFetch<{ data: DNSBlacklist }>(`/blacklist/${id}/toggle-active`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  return res.data;
}

export async function deleteBlacklist(id: string): Promise<void> {
  await apiFetch(`/blacklist/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
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

export async function fetchNotifications(page = 1, limit = 20): Promise<PaginatedResponse<NotificationItem>> {
  return apiFetch<PaginatedResponse<NotificationItem>>(`/notifications?page=${page}&limit=${limit}`);
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/notifications/read-all", { method: "PATCH" });
}

// ─────────────────────────────────────────── AI Reports ──────────────────────

export async function fetchReports(page = 1, limit = 10): Promise<PaginatedResponse<AIReport>> {
  return apiFetch<PaginatedResponse<AIReport>>(`/reports?page=${page}&limit=${limit}`);
}

// ─────────────────────────────────────────── Auth ────────────────────────────

export async function login(username: string, password: string): Promise<{ token: string }> {
  const res = await apiFetch<{ data: { token: string } }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (typeof window !== "undefined") {
    localStorage.setItem("sata_token", res.data.token);
  }
  return res.data;
}

export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("sata_token");
  }
}

export function isLoggedIn(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem("sata_token");
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
