"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { CircleCheck } from "@gravity-ui/icons";
import {
  bulkSetNotificationStatus,
  fetchNotifications,
  markAllNotificationsRead,
  setNotificationStatus,
  type NotificationQuery,
} from "@/lib/api";
import type { NotificationItem, NotificationSeverity, NotificationStatus, NotificationType } from "@/lib/types";
import { formatTimeWIB, formatDateTimeWIB, timeAgo } from "@/lib/format";
import { adminFetch } from "@/lib/admin-client";
import { BLACKLIST_TYPES, isKnownType } from "@/lib/blacklist";
import { useAuth } from "@/contexts/AuthContext";
import { NOTIFICATIONS_CHANGED_EVENT, useNotifications } from "@/contexts/NotificationsContext";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { useClientLabels } from "@/lib/useClientLabels";
import { isMaskedIp } from "@/lib/masked";

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<NotificationType, string> = {
  blacklist_alert: "Blocklist Alert",
  batch_summary: "Batch Summary",
  anomaly_alert: "Anomaly Alert",
  system_alert: "System Alert",
};

const SEVERITY_STYLE: Record<NotificationSeverity, string> = {
  critical: "bg-flag/10 text-flag border-flag/20",
  warning: "bg-watch/10 text-watch border-watch/20",
  info: "bg-surface-3 text-chalk-dim border-line",
};

const STATUS_STYLE: Record<NotificationStatus, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  acknowledged: "bg-surface-3 text-chalk-dim border-line",
  resolved: "bg-safe/10 text-safe border-safe/20",
};

const FIELD =
  "px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none";

interface Filters {
  status: NotificationStatus | "";
  severity: NotificationSeverity | "";
  type_send: NotificationType | "";
  from: string; // YYYY-MM-DD (hari WIB)
  to: string;
  q: string;
}
const EMPTY: Filters = { status: "", severity: "", type_send: "", from: "", to: "", q: "" };

/** Tanggal yang dipilih pengguna dibaca sebagai hari kalender WIB. */
function toQuery(f: Filters, page: number): NotificationQuery {
  return {
    page,
    limit: PAGE_SIZE,
    status: f.status,
    severity: f.severity,
    type_send: f.type_send,
    q: f.q.trim(),
    from: f.from ? `${f.from}T00:00:00+07:00` : undefined,
    to: f.to ? `${f.to}T23:59:59.999+07:00` : undefined,
  };
}

interface BlockTarget {
  domains: string[];
  group: string;
  type: string;
}

export default function NotificationsPage() {
  const { isAdmin } = useAuth();
  const { refresh: refreshBadge } = useNotifications();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY); // isi form
  const [applied, setApplied] = useState<Filters>(EMPTY); // filter yang dipakai query
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const labels = useClientLabels(items.flatMap((n) => (n.data.client ?? []).map((c) => c.ip)));

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await fetchNotifications(toQuery(applied, page));
        setItems(res.data);
        setTotal(res.meta.total);
        setTotalPages(Math.max(1, res.meta.total_pages));
        setNow(Date.now());
        // Pilihan yang sudah tidak ada di halaman ini dibuang
        setSelected((prev) => new Set([...prev].filter((id) => res.data.some((n) => n.id === id))));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load notifications");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [applied, page],
  );

  useLoad(() => load(), undefined, `${JSON.stringify(applied)}|${page}`);

  // Notifikasi baru terdeteksi poller (B3) → muat ulang diam-diam tanpa spinner
  useEffect(() => {
    const onChange = () => void load(true);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
  }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setApplied(draft);
  }
  function resetFilters() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  async function changeStatus(n: NotificationItem, status: NotificationStatus) {
    setBusy(true);
    try {
      await setNotificationStatus(n.id, status, (notes[n.id] ?? "").trim());
      setNotes((p) => ({ ...p, [n.id]: "" }));
      setNoteOpen(null);
      await Promise.all([load(true), refreshBadge()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function bulk(status: NotificationStatus) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const n = await bulkSetNotificationStatus([...selected], status);
      setFlash(`${n} notification${n === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      await Promise.all([load(true), refreshBadge()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      await Promise.all([load(true), refreshBadge()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlock() {
    if (!blockTarget) return;
    const t = blockTarget;
    setBusy(true);
    try {
      const res = await adminFetch("/api/blacklist", {
        method: "POST",
        body: JSON.stringify({
          domains: t.domains,
          group: t.group,
          type: isKnownType(t.type) ? t.type : "custom",
          description: "Blocked from a notification",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        created?: string[];
        skipped?: { reason: string }[];
        error?: string;
      };
      if (res.status === 403) setError("Only administrators can block domains.");
      else if (res.status === 201) {
        const skipped = data.skipped?.length ?? 0;
        setFlash(`Blocked ${data.created?.length ?? 0} domain(s)${skipped ? `, ${skipped} skipped` : ""}.`);
      } else if (res.status === 409) setFlash("Already on the blocklist.");
      else setError(data.error ?? "Failed to block the domain(s).");
    } catch {
      setError("Failed to block the domain(s).");
    } finally {
      setBusy(false);
      setBlockTarget(null);
    }
  }

  const allSelected = items.length > 0 && items.every((n) => selected.has(n.id));
  const newOnPage = items.filter((n) => n.status === "new").length;
  const filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Notifications" }]}
        title="Notifications"
        description={`${total} ${total === 1 ? "alert" : "alerts"}${filtered ? " match the filters" : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && newOnPage > 0 && (
              <button onClick={markAll} disabled={busy} className="btn" title="Acknowledge every new notification">
                <CircleCheck width={16} height={16} />
                <span>Mark all as read</span>
              </button>
            )}
            {isAdmin && (
              <Link href="/notifications/settings" className="btn">
                Settings
              </Link>
            )}
          </div>
        }
      />

      <div className="page-x py-6 md:py-8">
        <div className="w-full max-w-7xl mx-auto space-y-4">
          {/* ── Filter ── */}
          <form onSubmit={applyFilters} className="rounded-2xl border border-line bg-surface p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
            <label className="text-xs font-medium text-chalk-dim">
              Status
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Filters["status"] })} className={`${FIELD} w-full mt-1`}>
                <option value="">All</option>
                <option value="new">New</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              Severity
              <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as Filters["severity"] })} className={`${FIELD} w-full mt-1`}>
                <option value="">All</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              Type
              <select value={draft.type_send} onChange={(e) => setDraft({ ...draft, type_send: e.target.value as Filters["type_send"] })} className={`${FIELD} w-full mt-1`}>
                <option value="">All</option>
                {(Object.keys(TYPE_LABEL) as NotificationType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              From (WIB)
              <input type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${FIELD} w-full mt-1`} />
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              To (WIB)
              <input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={`${FIELD} w-full mt-1`} />
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              Search domain / IP
              <input type="search" value={draft.q} maxLength={100} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="example.com or 10.0.0.5" className={`${FIELD} w-full mt-1`} />
            </label>
            <div className="sm:col-span-2 lg:col-span-6 flex gap-2">
              <button type="submit" className="btn btn-primary">Apply filters</button>
              {filtered && (
                <button type="button" onClick={resetFilters} className="btn">Clear</button>
              )}
            </div>
          </form>

          {flash && (
            <div role="status" className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-chalk flex items-center justify-between">
              <span>{flash}</span>
              <button type="button" onClick={() => setFlash(null)} className="text-xs underline ml-3">Dismiss</button>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-4 text-sm text-flag flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => void load()} className="underline font-medium text-xs ml-3">Retry</button>
            </div>
          )}

          {/* ── Aksi massal (admin) ── */}
          {isAdmin && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2 text-chalk-dim">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(items.map((n) => n.id)) : new Set())}
                />
                Select all on this page
              </label>
              {selected.size > 0 && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="text-chalk font-medium">{selected.size} selected</span>
                  <button className="btn" disabled={busy} onClick={() => bulk("acknowledged")}>Acknowledge</button>
                  <button className="btn" disabled={busy} onClick={() => bulk("resolved")}>Resolve</button>
                  <button className="btn" disabled={busy} onClick={() => bulk("new")}>Reopen</button>
                </span>
              )}
            </div>
          )}

          {/* ── Daftar ── */}
          {loading ? (
            <div className="text-center py-24">
              <div className="w-9 h-9 border-3 border-line border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-chalk-dim">Loading notifications…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 px-4 rounded-2xl border border-dashed border-line bg-surface/40">
              <p className="text-base font-medium text-chalk">{filtered ? "No notifications match these filters" : "No notifications yet"}</p>
              <p className="text-xs text-chalk-faint mt-1">
                {filtered ? "Try widening the date range or clearing a filter." : "You will be notified when blocklist violations, anomalies or automated summaries occur."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((n) => {
                const hasClients = Boolean(n.data.client && n.data.client.length > 0);
                const totalClientHits = hasClients ? n.data.client.reduce((acc, c) => acc + (c.access_count || 1), 0) : 0;
                const domains = n.data.domain ?? [];
                const edge = n.severity === "critical" ? "border-l-flag" : n.severity === "warning" ? "border-l-watch" : "border-l-line";
                return (
                  <article
                    key={n.id}
                    className={`w-full rounded-2xl border bg-surface chalk-surface p-5 sm:p-6 transition-all duration-150 ${
                      n.status === "new" ? `border-line border-l-4 ${edge} shadow-xs` : "border-line opacity-80"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line/60">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            aria-label="Select notification"
                            checked={selected.has(n.id)}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(n.id);
                                else next.delete(n.id);
                                return next;
                              })
                            }
                          />
                        )}
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLE[n.severity]}`}>{n.severity}</span>
                        <span className="text-xs font-semibold text-chalk">{TYPE_LABEL[n.type_send] ?? n.type_send}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[n.status]}`}>{n.status}</span>
                        <span className="text-xs font-medium text-chalk" title={formatDateTimeWIB(n.timestamp)}>{formatTimeWIB(n.timestamp)} WIB</span>
                        <span className="text-xs text-chalk-faint">({timeAgo(n.timestamp, now)})</span>
                      </div>

                      {isAdmin && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className="text-xs underline text-chalk-dim hover:text-chalk" onClick={() => setNoteOpen(noteOpen === n.id ? null : n.id)}>
                            {noteOpen === n.id ? "Hide note" : "Add note"}
                          </button>
                          {n.status === "new" && (
                            <button className="btn !py-1 !px-2.5 !text-xs" disabled={busy} onClick={() => changeStatus(n, "acknowledged")}>Acknowledge</button>
                          )}
                          {n.status !== "resolved" && (
                            <button className="btn !py-1 !px-2.5 !text-xs" disabled={busy} onClick={() => changeStatus(n, "resolved")}>Resolve</button>
                          )}
                          {n.status !== "new" && (
                            <button className="btn !py-1 !px-2.5 !text-xs" disabled={busy} onClick={() => changeStatus(n, "new")}>Reopen</button>
                          )}
                        </div>
                      )}
                    </div>

                    {isAdmin && noteOpen === n.id && (
                      <div className="pt-3">
                        <input
                          type="text"
                          maxLength={500}
                          value={notes[n.id] ?? ""}
                          onChange={(e) => setNotes((p) => ({ ...p, [n.id]: e.target.value }))}
                          placeholder="Note saved with the next status change (optional)"
                          className={`${FIELD} w-full`}
                        />
                      </div>
                    )}

                    {(n.note || n.ack_by) && (
                      <p className="pt-3 text-xs text-chalk-dim">
                        {n.ack_by && <>Last changed by <strong className="text-chalk">{n.ack_by}</strong>. </>}
                        {n.note && <>Note: <span className="text-chalk">{n.note}</span></>}
                      </p>
                    )}

                    <div className={`pt-4 grid grid-cols-1 ${hasClients ? "lg:grid-cols-12 gap-6 items-start" : "gap-4"}`}>
                      <div className={hasClients ? "lg:col-span-5 xl:col-span-4 space-y-3.5" : "space-y-3"}>
                        {domains.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[11px] font-semibold text-chalk-faint uppercase tracking-wider">Target Domain{domains.length > 1 ? "s" : ""}</p>
                              {isAdmin && domains.length > 1 && (
                                <button type="button" className="text-xs underline text-flag" onClick={() => setBlockTarget({ domains, group: n.data.group, type: n.data.type })}>
                                  Block all {domains.length}
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {domains.map((dom, i) => (
                                <span key={i} className="inline-flex items-center gap-2 font-mono text-sm pl-3 pr-2 py-1 rounded-lg bg-surface-2 border border-line text-chalk font-semibold break-all">
                                  <Link href={`/domains/${encodeURIComponent(dom)}`} className="hover:underline">{dom}</Link>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      title={`Block ${dom}`}
                                      className="font-sans text-[11px] font-medium text-flag hover:underline"
                                      onClick={() => setBlockTarget({ domains: [dom], group: n.data.group, type: n.data.type })}
                                    >
                                      Block
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {(n.data.group || n.data.type) && (
                          <div>
                            <p className="text-[11px] font-semibold text-chalk-faint uppercase tracking-wider mb-1.5">Classification</p>
                            <div className="flex flex-wrap items-center gap-2">
                              {n.data.group && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-3 text-chalk text-xs font-medium border border-line">
                                  <span className="text-chalk-faint">Category:</span> {n.data.group}
                                </span>
                              )}
                              {n.data.type && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-3 text-chalk-dim text-xs font-medium border border-line">
                                  <span className="text-chalk-faint">Type:</span> {n.data.type}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {hasClients && (
                        <div className="lg:col-span-7 xl:col-span-8 lg:border-l lg:border-line/70 lg:pl-6 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-chalk-faint uppercase tracking-wider">Client Access ({n.data.client.length})</p>
                            <span className="text-xs text-chalk-dim font-medium">
                              Total queries: <strong className="text-flag font-semibold">{totalClientHits}×</strong>
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                            {n.data.client.map((c, i) => (
                              <div key={i} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line/80 text-xs">
                                <div className="min-w-0 pr-2">
                                  {isMaskedIp(c.ip) ? (
                                    <span className="font-mono text-chalk font-semibold text-sm">{c.ip}</span>
                                  ) : (
                                    <Link href={`/clients/${encodeURIComponent(c.ip)}`} className="font-mono text-chalk font-semibold text-sm hover:underline">{c.ip}</Link>
                                  )}
                                  {labels[c.ip] && <span className="block text-[11px] text-chalk-dim truncate">{labels[c.ip]}</span>}
                                  {c.ap_info?.label && <span className="block text-[11px] text-chalk-faint truncate mt-0.5">{c.ap_info.label}</span>}
                                </div>
                                <span className="font-mono text-flag font-semibold bg-flag/10 px-2.5 py-1 rounded-lg border border-flag/20 shrink-0">{c.access_count}×</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* ── Halaman ── */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-between pt-2" aria-label="Pagination">
              <button className="btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span className="text-sm text-chalk-dim">Page {page} of {totalPages}</span>
              <button className="btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </nav>
          )}
        </div>
      </div>

      {blockTarget && (
        <Modal title={blockTarget.domains.length > 1 ? `Block ${blockTarget.domains.length} domains?` : "Block this domain?"} onClose={() => setBlockTarget(null)}>
          <div className="space-y-3 text-sm text-chalk-dim">
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-line bg-surface-2 p-2 font-mono text-xs text-chalk space-y-1">
              {blockTarget.domains.map((d) => (
                <li key={d} className="break-all">{d}</li>
              ))}
            </ul>
            <p>
              They will be added to the blocklist under{" "}
              <strong className="text-chalk">
                {blockTarget.group || BLACKLIST_TYPES.find((t) => t.value === blockTarget.type)?.group || "Other"}
              </strong>
              . Clients will no longer be able to resolve them.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn" onClick={() => setBlockTarget(null)} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmBlock} disabled={busy}>{busy ? "Blocking…" : "Block"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
