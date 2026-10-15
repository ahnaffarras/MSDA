"use client";

import { useState } from "react";
import { useLoad } from "@/lib/useLoad";
import PageHeader from "@/components/PageHeader";
import { redirectToLogin } from "@/lib/admin-client";
import { formatDateTimeWIB } from "@/lib/format";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, type AuditAction, type AuditRow } from "@/lib/audit-types";

const FIELD =
  "px-3 py-2 rounded-lg border border-line bg-background text-sm text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none";

interface Filters {
  actor: string;
  action: string;
  from: string;
  to: string;
  q: string;
}
const EMPTY: Filters = { actor: "", action: "", from: "", to: "", q: "" };

function toParams(f: Filters, page?: number): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v.trim()) p.set(k, v.trim());
  if (page) p.set("page", String(page));
  return p;
}

const labelOf = (action: string) => AUDIT_ACTION_LABELS[action as AuditAction] ?? action;

function MetaCell({ meta }: { meta: Record<string, unknown> | null }) {
  if (!meta || Object.keys(meta).length === 0) return <span className="text-chalk-faint">—</span>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-chalk-dim">Details</summary>
      <pre className="mt-1 max-w-xs sm:max-w-md whitespace-pre-wrap break-words rounded-md bg-surface-2 border border-line p-2 text-[11px] text-chalk">
        {JSON.stringify(meta, null, 2)}
      </pre>
    </details>
  );
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit?${toParams(applied, page)}`, { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = (await res.json()) as { data?: AuditRow[]; meta?: { total: number; total_pages: number }; error?: string };
      if (!res.ok || !data.data || !data.meta) throw new Error(data.error ?? "Failed to load the audit log");
      setRows(data.data);
      setTotal(data.meta.total);
      setTotalPages(Math.max(1, data.meta.total_pages));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load the audit log");
    } finally {
      setLoading(false);
    }
  }
  useLoad(load, undefined, `${JSON.stringify(applied)}|${page}`);

  const filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);

  return (
    <div className="min-h-screen bg-background pb-12">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Audit Log" }]}
        title="Audit log"
        description={`${total.toLocaleString("en-US")} ${total === 1 ? "event" : "events"}${filtered ? " match the filters" : ""}. Times are in WIB.`}
        actions={
          <a href={`/api/audit/export?${toParams(applied)}`} className="btn" download>
            Export CSV
          </a>
        }
      />

      <div className="page-x py-6 md:py-8">
        <div className="w-full max-w-7xl mx-auto space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setApplied(draft);
            }}
            className="rounded-2xl border border-line bg-surface p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end"
          >
            <label className="text-xs font-medium text-chalk-dim">
              User
              <input value={draft.actor} maxLength={64} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} placeholder="username" className={`${FIELD} w-full mt-1`} />
            </label>
            <label className="text-xs font-medium text-chalk-dim">
              Action
              <select value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} className={`${FIELD} w-full mt-1`}>
                <option value="">All actions</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>
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
              Target / IP
              <input value={draft.q} maxLength={100} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="domain, id or IP" className={`${FIELD} w-full mt-1`} />
            </label>
            <div className="sm:col-span-2 lg:col-span-5 flex gap-2">
              <button type="submit" className="btn btn-primary">Apply filters</button>
              {filtered && (
                <button type="button" className="btn" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }}>Clear</button>
              )}
            </div>
          </form>

          {error && (
            <div role="alert" className="rounded-xl border border-flag-border bg-flag-bg p-4 text-sm text-flag flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => void load()} className="underline font-medium text-xs ml-3">Retry</button>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-chalk-faint border-b border-line">
                  <th className="px-4 py-3 font-semibold">Time (WIB)</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">IP</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-chalk-dim">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-chalk-dim">{filtered ? "No events match these filters." : "No events recorded yet."}</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-chalk">{formatDateTimeWIB(r.ts)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-chalk">{r.actor_username ?? <span className="text-chalk-faint">—</span>}</td>
                      <td className="px-4 py-3 text-chalk">{labelOf(r.action)}</td>
                      <td className="px-4 py-3 text-xs text-chalk-dim break-all">
                        {r.target_type || r.target_id ? `${r.target_type ?? ""}${r.target_id ? ` ${r.target_id}` : ""}`.trim() : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-chalk-dim">{r.ip ?? "—"}</td>
                      <td className="px-4 py-3"><MetaCell meta={r.meta} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between" aria-label="Pagination">
              <button className="btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span className="text-sm text-chalk-dim">Page {page} of {totalPages}</span>
              <button className="btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
