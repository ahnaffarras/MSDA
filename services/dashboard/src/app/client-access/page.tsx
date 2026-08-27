"use client";

import { useState, useEffect } from "react";
import { ListUl, ArrowDownToLine } from "@gravity-ui/icons";
import {
  fetchClientAccess,
  fetchClientAccessStats,
  clientAccessExportUrl,
} from "@/lib/api";
import type { ClientAccessLog, ClientAccessStats } from "@/lib/types";
import { formatTimeWIB } from "@/lib/format";

const TYPE_COLOR: Record<string, string> = {
  gambling:     "var(--accent-flag)",
  adult:        "var(--accent-flag)",
  malware:      "var(--accent-flag)",
  phishing:     "var(--accent-flag)",
  social_media: "var(--accent-watch)",
  streaming:    "var(--accent-watch)",
  gaming:       "var(--accent-watch)",
  educational:  "var(--accent-safe)",
  cloud:        "var(--accent-safe)",
  other:        "var(--chalk-faint)",
};

export default function ClientAccessPage() {
  const [items, setItems] = useState<ClientAccessLog[]>([]);
  const [stats, setStats] = useState<ClientAccessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState({ domain: "", client_ip: "", action: "" });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [accessRes, statsRes] = await Promise.all([
        fetchClientAccess({ ...filter, page, limit: 20 }),
        fetchClientAccessStats("7d"),
      ]);
      setItems(accessRes.data);
      setTotalPages(accessRes.meta.total_pages);
      setStats(statsRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, filter.domain, filter.client_ip, filter.action]);

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-chalk">Client Access Log</h1>
            <p className="text-sm text-chalk-dim">Riwayat akses DNS dari seluruh client</p>
          </div>
          <a
            href={clientAccessExportUrl("7d")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm text-chalk-dim hover:text-chalk transition-colors"
          >
            <ArrowDownToLine width={16} height={16} />
            Export CSV
          </a>
        </header>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface chalk-surface p-4">
              <p className="text-xs text-chalk-faint">Total Akses (7 hari)</p>
              <p className="mt-1 font-display text-2xl font-semibold text-chalk">
                {stats.per_day.reduce((s: number, d: { date: string; count: number }) => s + d.count, 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface chalk-surface p-4">
              <p className="text-xs text-chalk-faint">Tipe Terbanyak</p>
              <p className="mt-1 font-display text-2xl font-semibold text-chalk">
                {stats.per_type.length > 0 ? stats.per_type[0].type : "—"}
              </p>
              <p className="text-xs text-chalk-dim">{stats.per_type.length > 0 ? `${stats.per_type[0].count} akses` : ""}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface chalk-surface p-4">
              <p className="text-xs text-chalk-faint">AP Terbanyak</p>
              <p className="mt-1 font-display text-2xl font-semibold text-chalk">
                {stats.per_ap.length > 0 ? stats.per_ap[0].ap_label : "—"}
              </p>
              <p className="text-xs text-chalk-dim">{stats.per_ap.length > 0 ? `${stats.per_ap[0].count} akses` : ""}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Domain..."
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.domain}
            onChange={(e) => { setFilter((f) => ({ ...f, domain: e.target.value })); setPage(1); }}
          />
          <input
            type="text"
            placeholder="IP Client..."
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.client_ip}
            onChange={(e) => { setFilter((f) => ({ ...f, client_ip: e.target.value })); setPage(1); }}
          />
          <select
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.action}
            onChange={(e) => { setFilter((f) => ({ ...f, action: e.target.value })); setPage(1); }}
          >
            <option value="">Semua Aksi</option>
            <option value="allowed">Diizinkan</option>
            <option value="blocked">Diblokir</option>
          </select>
        </div>

        {error && <div className="mb-4 rounded-lg border border-flag bg-flag/10 p-3 text-sm text-flag">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-chalk-dim">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-chalk-dim">Tidak ada data akses.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface chalk-surface">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-chalk-faint">
                  <th className="p-4 font-medium">Waktu</th>
                  <th className="p-4 font-medium">IP Client</th>
                  <th className="p-4 font-medium">AP</th>
                  <th className="p-4 font-medium">Domain</th>
                  <th className="p-4 font-medium">Tipe</th>
                  <th className="p-4 font-medium">Aksi</th>
                  <th className="p-4 font-medium text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line/60 last:border-0">
                    <td className="p-4 font-data text-chalk-dim whitespace-nowrap">
                      {formatTimeWIB(item.timestamp)}
                    </td>
                    <td className="p-4 font-data text-chalk">{item.client_ip}</td>
                    <td className="p-4 text-chalk-dim text-xs">{item.ap_info.label}</td>
                    <td className="p-4 font-data text-chalk max-w-[180px] truncate">{item.domain}</td>
                    <td className="p-4">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          color: TYPE_COLOR[item.type] ?? "var(--chalk-faint)",
                          backgroundColor: `color-mix(in srgb, ${TYPE_COLOR[item.type] ?? "var(--chalk-faint)"} 12%, transparent)`,
                        }}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          color: item.action === "blocked" ? "var(--accent-flag)" : "var(--accent-safe)",
                          backgroundColor: item.action === "blocked" ? "var(--accent-flag-bg)" : "var(--accent-safe-bg)",
                        }}
                      >
                        {item.action === "blocked" ? "Diblokir" : "Diizinkan"}
                      </span>
                    </td>
                    <td className="p-4 text-right font-data text-chalk-dim">{item.access_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-chalk-dim hover:text-chalk disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="font-data text-sm text-chalk-dim">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-chalk-dim hover:text-chalk disabled:opacity-40"
            >
              Selanjutnya
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
