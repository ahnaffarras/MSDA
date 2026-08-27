"use client";

import { useState, useEffect } from "react";
import { Globe, Link } from "@gravity-ui/icons";
import {
  fetchDNSInfoList,
  fetchDNSInfoGroups,
  fetchDNSInfoTypes,
} from "@/lib/api";
import type { DNSInfo } from "@/lib/types";

export default function DNSInfoPage() {
  const [items, setItems] = useState<DNSInfo[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ type: "", group: "", search: "" });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [infoRes, groupRes, typeRes] = await Promise.all([
        fetchDNSInfoList({ ...filter, limit: 100 }),
        fetchDNSInfoGroups(),
        fetchDNSInfoTypes(),
      ]);
      setItems(infoRes.data);
      setGroups(groupRes);
      setTypes(typeRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter.type, filter.group, filter.search]);

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-semibold text-chalk">DNS Info</h1>
          <p className="text-sm text-chalk-dim">Database domain yang sudah di-enrich oleh AI Analyzer</p>
        </header>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.type}
            onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="">Semua Tipe</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.group}
            onChange={(e) => setFilter((f) => ({ ...f, group: e.target.value }))}
          >
            <option value="">Semua Group</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input
            type="text"
            placeholder="Cari domain atau company..."
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        {error && <div className="mb-4 rounded-lg border border-flag bg-flag/10 p-3 text-sm text-flag">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-chalk-dim">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-chalk-dim">Tidak ada data DNS info.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-line bg-surface chalk-surface p-5 hover:border-chalk-dim transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-data text-chalk truncate">{item.domain}</h3>
                    {item.group && <p className="text-xs text-chalk-faint">{item.group}</p>}
                  </div>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-xs"
                    style={{
                      borderColor: "var(--accent-safe)",
                      color: "var(--accent-safe)",
                      backgroundColor: "var(--accent-safe-bg)",
                    }}
                  >
                    {item.type}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-chalk-dim">
                  {item.info_app?.company_responsible && (
                    <p><span className="text-chalk-faint">Company:</span> {item.info_app.company_responsible}</p>
                  )}
                  {item.host_isp?.org && (
                    <p><span className="text-chalk-faint">ISP:</span> {item.host_isp.org}</p>
                  )}
                  {item.ip_scan.length > 0 && (
                    <p><span className="text-chalk-faint">IP:</span> {item.ip_scan.slice(0, 3).map((ip) => ip.ip).join(", ")}{item.ip_scan.length > 3 && "..."}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                  <span className="text-[10px] text-chalk-faint">
                    {new Date(item.last_verified).toLocaleDateString("id-ID")}
                  </span>
                  <a
                    href={`https://${item.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-chalk-dim hover:text-chalk"
                  >
                    <Link width={12} height={12} />
                    Buka
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
