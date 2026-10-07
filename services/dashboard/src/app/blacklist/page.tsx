"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-client";
import { useAuth } from "@/contexts/AuthContext";
import {
  BLACKLIST_TYPES,
  normalizeDomain,
  splitDomains,
  typeLabel,
  type BlacklistEntry,
} from "@/lib/blacklist";
import { formatDateTimeWIB, timeAgo } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/lib/useLoad";

type StatusFilter = "all" | "active" | "inactive";
type Notice = { tone: "ok" | "warn" | "error"; text: string } | null;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function BlacklistPage() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { isAdmin, loading: authLoading } = useAuth();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [domainsInput, setDomainsInput] = useState("");
  const [newType, setNewType] = useState("gambling");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [now, setNow] = useState(() => Date.now());

  // State untuk seleksi baris
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // State untuk kebab menu terbuka: id dari entry
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);
  const kebabRef = useRef<HTMLDivElement | null>(null);

  // State untuk dialog konfirmasi delete (single atau batch)
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    isBatch?: boolean;
    entry?: BlacklistEntry;
  }>({ open: false });

  // Tutup dropdown jika klik di luar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setOpenKebabId(null);
      }
    }
    if (openKebabId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openKebabId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/blacklist");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error("bad response");
      setEntries(data);
      setLoadError(false);
      setNow(Date.now());
    } catch (error) {
      console.error("Failed to fetch blacklist:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useLoad(load);

  /** Jalankan aksi tulis. 401 (sesi habis) ditangani adminFetch; 403 = bukan administrator. */
  const write = async (url: string, init: RequestInit): Promise<Response | null> => {
    const res = await adminFetch(url, init);
    if (res.status === 403) {
      setNotice({ tone: "error", text: "Only administrators can change the blocklist." });
      return null;
    }
    return res;
  };

  const addDomains = async () => {
    const parts = splitDomains(domainsInput);
    if (parts.length === 0) {
      setNotice({ tone: "error", text: "Enter at least one domain." });
      return;
    }
    const invalid = parts.filter((p) => !normalizeDomain(p));
    if (invalid.length === parts.length) {
      setNotice({
        tone: "error",
        text: `“${invalid[0]}” is not a valid domain name. Example: bet99.com`,
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await write("/api/blacklist", {
        method: "POST",
        body: JSON.stringify({
          domains: parts,
          type: newType,
          description: newDescription,
        }),
      });
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setNotice({
          tone: "error",
          text: data?.error ?? "Failed to add the domain.",
        });
        return;
      }
      const created: string[] = data.created ?? [];
      const skipped: { input: string; reason: string }[] = data.skipped ?? [];
      const exists = skipped.filter((s) => s.reason === "exists").length;
      const bad = skipped.filter((s) => s.reason === "invalid").length;
      const bits = [
        created.length > 0
          ? `${created.length} ${created.length === 1 ? "domain" : "domains"} added`
          : "",
        exists > 0 ? `${exists} already listed` : "",
        bad > 0 ? `${bad} invalid` : "",
      ].filter(Boolean);
      setNotice({
        tone: created.length > 0 ? (bad || exists ? "warn" : "ok") : "error",
        text: bits.join(", ") + ".",
      });
      if (created.length > 0) {
        setDomainsInput("");
        setNewDescription("");
        await load();
      }
    } catch {
      setNotice({
        tone: "error",
        text: "Could not reach the server. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (entry: BlacklistEntry) => {
    setOpenKebabId(null);
    setNotice(null);
    const res = await write(`/api/blacklist/${entry._id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !entry.is_active }),
    });
    if (!res) return;
    if (!res.ok) setNotice({ tone: "error", text: "Failed to change the status." });
    await load();
  };

  const removeSingle = async (entry: BlacklistEntry) => {
    setDeleteDialog({ open: false });
    setOpenKebabId(null);
    setNotice(null);
    const res = await write(`/api/blacklist/${entry._id}`, { method: "DELETE" });
    if (!res) return;
    setNotice(
      res.ok
        ? { tone: "ok", text: `${entry.domain} removed from the blocklist.` }
        : { tone: "error", text: "Failed to delete." }
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(entry._id);
      return next;
    });
    await load();
  };

  // Batch actions
  const batchToggleActive = async (targetActive: boolean) => {
    setNotice(null);
    setBusy(true);
    let successCount = 0;
    for (const id of Array.from(selectedIds)) {
      const res = await write(`/api/blacklist/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: targetActive }),
      });
      if (res && res.ok) successCount++;
    }
    setBusy(false);
    setNotice({
      tone: "ok",
      text: `${successCount} domain ${targetActive ? "diaktifkan" : "dinonaktifkan"}.`,
    });
    await load();
  };

  const batchDelete = async () => {
    setDeleteDialog({ open: false });
    setNotice(null);
    setBusy(true);
    let successCount = 0;
    for (const id of Array.from(selectedIds)) {
      const res = await write(`/api/blacklist/${id}`, { method: "DELETE" });
      if (res && res.ok) successCount++;
    }
    setBusy(false);
    setSelectedIds(new Set());
    setNotice({
      tone: "ok",
      text: `${successCount} domain berhasil dihapus dari blocklist.`,
    });
    await load();
  };

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    entries.forEach((e) => byType.set(e.type, (byType.get(e.type) ?? 0) + 1));
    return byType;
  }, [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      return !q || e.domain.includes(q) || e.description.toLowerCase().includes(q);
    });
  }, [entries, search, typeFilter, statusFilter]);

  const isAllSelected = visible.length > 0 && visible.every((e) => selectedIds.has(e._id));
  const isSomeSelected = visible.some((e) => selectedIds.has(e._id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((e) => e._id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeCount = entries.filter((e) => e.is_active).length;
  const stillHit = entries.filter((e) => e.is_active && (e.hits_7d ?? 0) > 0).length;

  return (
    <div className="min-h-screen bg-background pb-16">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Blocklist" }]}
        title="Blocklist"
        description={
          <>
            The n8n workflow checks every DNS query against this list. Blocking{" "}
            <span className="font-mono">example.com</span> also blocks{" "}
            <span className="font-mono">cdn.example.com</span> and every other subdomain.
          </>
        }
      >
        {!loading && !loadError && (
          <p className="mt-4 text-sm text-chalk">
            <strong className="font-semibold tabular-nums">{activeCount}</strong>{" "}
            {activeCount === 1 ? "domain" : "domains"} actively blocked
            {entries.length - activeCount > 0 && (
              <span className="text-chalk-faint">
                , {entries.length - activeCount} disabled
              </span>
            )}
            {stillHit > 0 && (
              <span className="text-watch">
                {" "}
                — {stillHit} of them were still requested in the last 7 days
              </span>
            )}
          </p>
        )}
      </PageHeader>

      <div className="page-x py-6 md:py-8 space-y-6">
        {!authLoading && !isAdmin && (
          <p className="rounded-lg border border-watch-border bg-watch-bg px-3.5 py-2.5 text-sm text-watch">
            You have view-only access. Only administrators can add, disable or delete blocked domains.
          </p>
        )}

        {/* Form Tambah Domain */}
        <div className="rounded-xl border border-line bg-surface p-4 md:p-6 space-y-4">
          <h2 className="text-base font-semibold text-chalk">Add domains to blocklist</h2>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4">
            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-1.5">
                Domain names (separate by space, comma, or new line)
              </label>
              <textarea
                value={domainsInput}
                onChange={(e) => setDomainsInput(e.target.value)}
                placeholder="example.com, sub.gambling-site.net"
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-background text-sm font-mono text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
              />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-chalk-dim mb-1.5">
                  Category
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk focus:border-primary focus:outline-none"
                >
                  {BLACKLIST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-chalk-dim mb-1.5">
                  Notes / Reason (optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g. Blocked per school rule"
                  className="w-full px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={addDomains}
              disabled={busy}
              className="btn bg-primary text-white hover:bg-primary/90 px-4 py-2 text-sm font-medium rounded-lg"
            >
              {busy ? "Adding…" : "Add to Blocklist"}
            </button>
          </div>

          {notice && (
            <p
              className={`rounded-lg border px-4 py-2.5 text-sm ${
                notice.tone === "ok"
                  ? "border-safe-border bg-safe-bg text-safe"
                  : notice.tone === "warn"
                  ? "border-watch-border bg-watch-bg text-watch"
                  : "border-flag-border bg-flag-bg text-flag"
              }`}
            >
              {notice.text}
            </p>
          )}
        </div>

        {/* Section List Blocked Domains */}
        <section aria-labelledby="list-heading" className="min-w-0 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 id="list-heading" className="text-lg font-semibold text-chalk">
                List Blocked Domains
              </h2>
              <span className="text-xs text-chalk-faint">
                ({visible.length} of {entries.length})
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-chalk-faint"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search domains…"
                  className="w-full sm:w-64 pl-9 pr-3 py-1.5 rounded-lg border border-line bg-surface text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
                />
              </div>

              <div
                role="group"
                aria-label="Status filter"
                className="flex rounded-lg border border-line overflow-hidden shrink-0"
              >
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={statusFilter === f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`px-3 py-1.5 text-xs font-medium border-r border-line last:border-r-0 transition-colors ${
                      statusFilter === f.value
                        ? "bg-primary text-white"
                        : "bg-surface text-chalk-dim hover:bg-surface-2"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category Chips Filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
            {[
              { value: "all", label: "All categories", n: entries.length },
              ...BLACKLIST_TYPES.filter((t) => counts.has(t.value)).map((t) => ({
                value: t.value,
                label: t.label,
                n: counts.get(t.value) ?? 0,
              })),
            ].map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={typeFilter === c.value}
                onClick={() => setTypeFilter(c.value)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs border whitespace-nowrap transition-colors ${
                  typeFilter === c.value
                    ? "bg-chalk text-background border-chalk font-semibold"
                    : "bg-surface text-chalk-dim border-line hover:border-line-strong"
                }`}
              >
                {c.label} <span className="tabular-nums opacity-70">({c.n})</span>
              </button>
            ))}
          </div>

          {/* Toolbar Seleksi (Muncul jika ada item yang di-select) */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-primary/40 bg-primary/10">
              <span className="text-sm font-medium text-chalk">
                {selectedIds.size} domain dipilih
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => batchToggleActive(true)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-medium text-chalk hover:bg-surface-2"
                >
                  Aktifkan
                </button>
                <button
                  type="button"
                  onClick={() => batchToggleActive(false)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-medium text-chalk hover:bg-surface-2"
                >
                  Nonaktifkan
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteDialog({ open: true, isBatch: true })}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-flag/10 border border-flag/20 text-xs font-medium text-flag hover:bg-flag/20"
                >
                  Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2.5 py-1.5 text-xs text-chalk-faint hover:text-chalk underline"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-20 grid place-items-center">
              <div className="w-8 h-8 border-3 border-line border-t-primary rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-flag-border bg-flag-bg p-6 text-center">
              <p className="font-medium text-flag">The blocklist could not be loaded</p>
              <p className="text-xs text-chalk-dim mt-1">
                Check the database connection and try again.
              </p>
              <button
                type="button"
                onClick={load}
                className="mt-3 px-3.5 py-1.5 rounded-lg bg-surface border border-line text-xs font-medium text-chalk"
              >
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
              <p className="font-medium text-chalk">
                {entries.length === 0 ? "The blocklist is empty" : "No matching domains"}
              </p>
              <p className="text-xs text-chalk-faint mt-1">
                {entries.length === 0
                  ? "Add a domain above, or block one directly from the DNS Intelligence page."
                  : "Change the search or filters above."}
              </p>
            </div>
          ) : (
            /* TABEL BARU: Kolom Domain | Request | Category | Action + Checkbox */
            <div className="rounded-xl border border-line bg-surface overflow-visible">
              {/* Header Desktop */}
              <div className="hidden md:grid grid-cols-[2.75rem_minmax(0,1fr)_10rem_10rem_3.5rem] items-center gap-4 px-4 py-3 border-b border-line bg-surface-2 text-xs font-semibold text-chalk-faint uppercase">
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={toggleSelectAll}
                    aria-label="Select all domains"
                    className="w-4 h-4 rounded border-line cursor-pointer text-primary focus:ring-primary"
                  />
                </div>
                <span>Domain</span>
                <span>Request</span>
                <span>Category</span>
                <span className="text-right pr-2">Action</span>
              </div>

              {/* Baris Data */}
              <ul className="divide-y divide-line">
                {visible.map((e) => {
                  const isSelected = selectedIds.has(e._id);
                  const isMenuOpen = openKebabId === e._id;

                  return (
                    <li
                      key={e._id}
                      className={`relative transition-colors ${
                        isSelected ? "bg-primary/5" : "hover:bg-surface-2/60"
                      } ${e.is_active ? "" : "opacity-75"}`}
                    >
                      {/* Desktop Grid Layout: Domain | Request | Category | Action */}
                      <div className="hidden md:grid grid-cols-[2.75rem_minmax(0,1fr)_10rem_10rem_3.5rem] items-center gap-4 px-4 py-3.5">
                        {/* Kolom Checkbox */}
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(e._id)}
                            aria-label={`Select ${e.domain}`}
                            className="w-4 h-4 rounded border-line cursor-pointer text-primary focus:ring-primary"
                          />
                        </div>

                        {/* Kolom Domain (dengan indikator status aktif/nonaktif di samping nama domain) */}
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-chalk break-all">
                              {e.domain}
                            </span>
                            {/* Indikator status aktif/nonaktif */}
                            {e.is_active ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-safe/10 text-safe border border-safe/20"
                                title="Active block"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-safe" />
                                Active
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-3 text-chalk-faint border border-line"
                                title="Disabled block"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-chalk-faint" />
                                Inactive
                              </span>
                            )}
                          </div>
                          {(e.description || e.created_at) && (
                            <p className="text-xs text-chalk-faint mt-1 truncate">
                              {e.description || e.group}
                              {e.created_at && (
                                <span> · added {formatDateTimeWIB(e.created_at)}</span>
                              )}
                            </p>
                          )}
                        </div>

                        {/* Kolom Request */}
                        <div className="text-sm tabular-nums">
                          {(e.hits_7d ?? 0) > 0 ? (
                            <Link
                              href={`/dns-intelligence?domain=${encodeURIComponent(
                                e.domain
                              )}`}
                              className="text-watch font-medium underline underline-offset-4 hover:text-primary transition-colors"
                              title="View requests in DNS Intelligence"
                            >
                              {e.hits_7d}×{" "}
                              <span className="font-normal text-chalk-faint text-xs">
                                · {e.last_hit ? timeAgo(e.last_hit, now) : ""}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-chalk-faint text-xs font-mono">none</span>
                          )}
                        </div>

                        {/* Kolom Category */}
                        <div className="text-sm text-chalk-dim truncate">
                          {typeLabel(e.type)}
                        </div>

                        {/* Kolom Action: Titik Tiga (Kebab Menu) */}
                        <div className="relative text-right">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setOpenKebabId(isMenuOpen ? null : e._id);
                            }}
                            className="w-8 h-8 inline-grid place-items-center rounded-lg border border-transparent hover:border-line hover:bg-surface-3 text-chalk-dim hover:text-chalk transition-colors"
                            aria-label={`Menu for ${e.domain}`}
                            aria-haspopup="true"
                            aria-expanded={isMenuOpen}
                          >
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>

                          {/* Dropdown Menu Desktop */}
                          {isMenuOpen && (
                            <div
                              ref={kebabRef}
                              className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-line bg-surface shadow-lg py-1 z-50 text-left text-xs animate-in fade-in zoom-in-95 duration-100"
                            >
                              <button
                                type="button"
                                onClick={() => toggleActive(e)}
                                className="w-full px-3.5 py-2 flex items-center gap-2 text-chalk hover:bg-surface-2 transition-colors font-medium"
                              >
                                {e.is_active ? (
                                  <>
                                    <svg
                                      className="w-3.5 h-3.5 text-watch"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                      />
                                    </svg>
                                    <span>Nonaktifkan</span>
                                  </>
                                ) : (
                                  <>
                                    <svg
                                      className="w-3.5 h-3.5 text-safe"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                    <span>Aktifkan</span>
                                  </>
                                )}
                              </button>
                              <div className="border-t border-line my-1" />
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenKebabId(null);
                                  setDeleteDialog({ open: true, entry: e });
                                }}
                                className="w-full px-3.5 py-2 flex items-center gap-2 text-flag hover:bg-flag/10 transition-colors font-medium"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mobile Card Layout (< md): Touch-Friendly & Clean */}
                      <div className="md:hidden p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(e._id)}
                              aria-label={`Select ${e.domain}`}
                              className="w-5 h-5 mt-0.5 rounded border-line text-primary focus:ring-primary shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-semibold text-chalk break-all">
                                {e.domain}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {e.is_active ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-safe/10 text-safe border border-safe/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-safe" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-3 text-chalk-faint border border-line">
                                    <span className="w-1.5 h-1.5 rounded-full bg-chalk-faint" />
                                    Inactive
                                  </span>
                                )}
                                <span className="text-xs text-chalk-dim">
                                  {typeLabel(e.type)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Tombol titik tiga mobile dengan touch area besar (min 44x44px) */}
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setOpenKebabId(isMenuOpen ? null : e._id);
                              }}
                              className="w-11 h-11 grid place-items-center rounded-lg border border-line bg-surface-2 text-chalk hover:bg-surface-3"
                              aria-label={`Action menu for ${e.domain}`}
                            >
                              <svg
                                className="w-5 h-5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                              </svg>
                            </button>

                            {/* Dropdown Menu Mobile */}
                            {isMenuOpen && (
                              <div
                                ref={kebabRef}
                                className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-line bg-surface shadow-xl py-1.5 z-50 text-xs"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleActive(e)}
                                  className="w-full px-4 py-2.5 flex items-center gap-2.5 text-chalk hover:bg-surface-2 text-sm font-medium"
                                >
                                  {e.is_active ? "Nonaktifkan" : "Aktifkan"}
                                </button>
                                <div className="border-t border-line my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenKebabId(null);
                                    setDeleteDialog({ open: true, entry: e });
                                  }}
                                  className="w-full px-4 py-2.5 flex items-center gap-2.5 text-flag hover:bg-flag/10 text-sm font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Requests & metadata */}
                        <div className="flex items-center justify-between text-xs pt-1 text-chalk-faint border-t border-line/40">
                          <span>
                            Requests:{" "}
                            {(e.hits_7d ?? 0) > 0 ? (
                              <strong className="text-watch font-semibold">
                                {e.hits_7d}×
                              </strong>
                            ) : (
                              "none"
                            )}
                          </span>
                          {e.description && (
                            <span className="truncate max-w-[180px]">
                              {e.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Modal Dialog Konfirmasi Hapus */}
      {deleteDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface rounded-2xl border border-line max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-flag/10 border border-flag/20 grid place-items-center text-flag shrink-0">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-chalk">
                  {deleteDialog.isBatch
                    ? `Delete ${selectedIds.size} domain(s)?`
                    : "Delete from blocklist?"}
                </h3>
                <p className="text-xs text-chalk-faint mt-0.5">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <p className="text-sm text-chalk-dim leading-relaxed">
              {deleteDialog.isBatch ? (
                <>
                  Are you sure you want to delete{" "}
                  <strong className="text-chalk font-semibold">
                    {selectedIds.size}
                  </strong>{" "}
                  selected domain(s) from the blocklist? DNS queries to these domains
                  will no longer be blocked.
                </>
              ) : (
                <>
                  Are you sure you want to remove{" "}
                  <strong className="text-chalk font-mono font-semibold">
                    {deleteDialog.entry?.domain}
                  </strong>{" "}
                  from the blocklist?
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteDialog({ open: false })}
                className="px-4 py-2 rounded-lg border border-line bg-surface hover:bg-surface-2 text-sm font-medium text-chalk transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteDialog.isBatch) {
                    batchDelete();
                  } else if (deleteDialog.entry) {
                    removeSingle(deleteDialog.entry);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-flag text-white hover:bg-flag/90 text-sm font-semibold transition-colors"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
