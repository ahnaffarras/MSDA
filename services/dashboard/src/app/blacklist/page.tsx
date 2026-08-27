"use client";

import { useState, useEffect } from "react";
import { Plus, TrashBin, ToggleOn, Xmark } from "@gravity-ui/icons";
import {
  fetchBlacklist,
  createBlacklist,
  toggleBlacklist,
  deleteBlacklist,
  fetchDNSInfoTypes,
} from "@/lib/api";
import type { DNSBlacklist } from "@/lib/types";

export default function BlacklistPage() {
  const [items, setItems] = useState<DNSBlacklist[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({ type: "", search: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    blocked_level: "domain" as "domain" | "group",
    domain: "",
    group: "",
    type: "gambling",
    is_active: true,
  });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [blRes, typeRes] = await Promise.all([
        fetchBlacklist({ ...filter, limit: 100 }),
        fetchDNSInfoTypes(),
      ]);
      setItems(blRes.data);
      setTypes(typeRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter.type, filter.search]);

  async function handleCreate() {
    if (createForm.blocked_level === "domain" && !createForm.domain.trim()) return;
    if (createForm.blocked_level === "group" && !createForm.group.trim()) return;
    setCreating(true);
    try {
      const created = await createBlacklist(createForm);
      setItems((prev) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ blocked_level: "domain", domain: "", group: "", type: "gambling", is_active: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal membuat entry");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await toggleBlacklist(id);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal toggle");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus entry ini?")) return;
    try {
      await deleteBlacklist(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal hapus");
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-chalk">Blacklist DNS</h1>
            <p className="text-sm text-chalk-dim">Kelola domain dan group yang diblokir</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl border border-safe bg-safe/10 px-4 py-2 text-sm font-medium text-safe hover:bg-safe/20"
          >
            <Plus width={16} height={16} />
            Tambah Entry
          </button>
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
          <input
            type="text"
            placeholder="Cari domain atau group..."
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        {error && <div className="mb-4 rounded-lg border border-flag bg-flag/10 p-3 text-sm text-flag">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-chalk-dim">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-chalk-dim">Tidak ada data blacklist.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface chalk-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-chalk-faint">
                  <th className="p-4 font-medium">Level</th>
                  <th className="p-4 font-medium">Domain / Group</th>
                  <th className="p-4 font-medium">Tipe</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line/60 last:border-0">
                    <td className="p-4 font-data text-chalk">{item.blocked_level}</td>
                    <td className="p-4 text-chalk">{item.domain || item.group || "—"}</td>
                    <td className="p-4">
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-chalk-dim">
                        {item.type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          color: item.is_active ? "var(--accent-safe)" : "var(--chalk-faint)",
                          backgroundColor: item.is_active ? "var(--accent-safe-bg)" : "var(--surface-2)",
                        }}
                      >
                        {item.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(item.id)}
                          className="rounded-lg border border-line bg-surface-2 p-2 hover:bg-surface text-chalk-dim hover:text-chalk transition-colors"
                          title="Toggle aktif/nonaktif"
                        >
                          <ToggleOn width={14} height={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="rounded-lg border border-flag/30 bg-flag/10 p-2 hover:bg-flag/20 text-flag transition-colors"
                          title="Hapus"
                        >
                          <TrashBin width={14} height={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 chalk-surface">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-chalk">Tambah Blacklist</h2>
                <button onClick={() => setShowCreate(false)} className="text-chalk-dim hover:text-chalk">
                  <Xmark width={20} height={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-chalk-dim">Level Blocking</label>
                  <select
                    className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-chalk outline-none"
                    value={createForm.blocked_level}
                    onChange={(e) => setCreateForm((f) => ({ ...f, blocked_level: e.target.value as "domain" | "group" }))}
                  >
                    <option value="domain">Domain</option>
                    <option value="group">Group</option>
                  </select>
                </div>

                {createForm.blocked_level === "domain" ? (
                  <div>
                    <label className="mb-1 block text-xs text-chalk-dim">Domain</label>
                    <input
                      type="text"
                      placeholder="contoh: totok777.com"
                      className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-chalk outline-none"
                      value={createForm.domain}
                      onChange={(e) => setCreateForm((f) => ({ ...f, domain: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs text-chalk-dim">Group</label>
                    <input
                      type="text"
                      placeholder="contoh: Totok 777"
                      className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-chalk outline-none"
                      value={createForm.group}
                      onChange={(e) => setCreateForm((f) => ({ ...f, group: e.target.value }))}
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs text-chalk-dim">Tipe</label>
                  <select
                    className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-chalk outline-none"
                    value={createForm.type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="gambling">Gambling</option>
                    <option value="adult">Adult</option>
                    <option value="malware">Malware</option>
                    <option value="phishing">Phishing</option>
                    <option value="crypto_miner">Crypto Miner</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={createForm.is_active}
                    onChange={(e) => setCreateForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="accent-safe"
                  />
                  <label htmlFor="is_active" className="text-sm text-chalk-dim">Aktif</label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm text-chalk-dim hover:text-chalk"
                >
                  Batal
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="rounded-lg bg-safe px-4 py-2 text-sm font-medium text-white hover:bg-safe/80 disabled:opacity-50"
                >
                  {creating ? "Membuat..." : "Buat"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
