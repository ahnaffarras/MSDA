"use client";

import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/admin-client";
import { formatDateTimeWIB } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

interface Status {
  enabled: boolean;
  healthy?: boolean;
  version?: string;
  protection?: boolean;
  blocking_mode?: string;
  rule_count?: number;
  blocked_today?: number;
  last_sync_at?: string;
  sync_status?: string;
  error?: string;
  problems?: string[];
}
interface CheckData { domain: string; would_block: boolean; reason?: string; rule?: string; rules?: string[]; never_block: boolean }

const PROBLEM_TEXT: Record<string, string> = {
  unreachable: "AdGuard Home cannot be reached — DNS blocking may be inactive.",
  protection_off: "AdGuard protection is switched off — nothing is being blocked.",
  sync_error: "The last rule sync failed.",
  sync_stale: "Rules have not been synced recently.",
  never_synced: "Rules have never been synced.",
};

/** Resolver DoH publik yang sering dipakai untuk melewati DNS (saran, bukan otomatis). */
const DOH_PRESET = [
  "dns.google", "cloudflare-dns.com", "one.one.one.one", "dns.quad9.net",
  "doh.opendns.com", "dns.nextdns.io", "dns.adguard-dns.com", "doh.cleanbrowsing.org",
];

const BTN = "px-3 py-1.5 rounded-lg border border-line bg-surface text-xs font-medium text-chalk hover:bg-surface-2 disabled:opacity-50";

export default function EnforcementPanel({ isAdmin, onChanged }: { isAdmin: boolean; onChanged?: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [neverBlock, setNeverBlock] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState("");
  const [check, setCheck] = useState<CheckData | null>(null);
  const [checkErr, setCheckErr] = useState("");
  const [confirmDoh, setConfirmDoh] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        fetch("/api-proxy/v1/adguard/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { enabled: false })),
        fetch("/api/enforcement", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { never_block: [] })),
      ]);
      setSt(s as Status);
      setNeverBlock((c as { never_block?: string[] }).never_block ?? []);
    } catch {
      setSt({ enabled: false });
    }
  }, []);
  useLoad(load, 30_000);

  const act = async (url: string, body: unknown, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await adminFetch(url, { method: "POST", body: JSON.stringify(body ?? {}) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) setMsg({ tone: "error", text: "Only administrators can do this." });
      else if (!res.ok || j.ok === false) setMsg({ tone: "error", text: j.error ?? "The request failed." });
      else setMsg({ tone: "ok", text: ok });
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const runCheck = async () => {
    setCheck(null);
    setCheckErr("");
    if (!domain.trim()) return;
    try {
      const res = await fetch(`/api-proxy/v1/adguard/check?domain=${encodeURIComponent(domain.trim())}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setCheckErr(j.error ?? "Could not check this domain.");
      else setCheck(j.data as CheckData);
    } catch {
      setCheckErr("Could not reach the server.");
    }
  };

  const addDoh = async () => {
    setConfirmDoh(false);
    await act("/api/blacklist", {
      domains: DOH_PRESET, type: "custom", block_mode: "enforce", source: "feed",
      description: "Public DoH resolver (prevents bypassing DNS blocking)", confirm_high_impact: true,
    }, "DoH resolvers added and set to Block DNS.");
  };

  if (!st) return null;

  if (!st.enabled) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-4 md:p-5">
        <h2 className="text-base font-semibold text-chalk">DNS Enforcement is off</h2>
        <p className="text-sm text-chalk-dim mt-1 leading-relaxed">
          The blocklist only monitors: matching domains raise alerts but clients can still open them. To block domains at DNS, set{" "}
          <span className="font-mono text-chalk">MSDA_ENFORCEMENT_ENABLED=true</span>, start AdGuard Home with{" "}
          <span className="font-mono text-chalk">docker compose --profile enforcement up -d</span> and follow{" "}
          <span className="font-mono text-chalk">docs/adguard.md</span>.
        </p>
      </div>
    );
  }

  const problems = st.problems ?? [];
  return (
    <div className="rounded-xl border border-line bg-surface p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-chalk">DNS Enforcement</h2>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${st.healthy ? "bg-safe/10 text-safe border-safe/20" : "bg-flag/10 text-flag border-flag/20"}`}>
            {st.healthy ? "Connected" : problems.includes("unreachable") ? "Disconnected" : "Needs attention"}
          </span>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={busy} onClick={() => act("/api-proxy/v1/adguard/sync?force=true", {}, "Rules synced to AdGuard Home.")}>Sync now</button>
            <button
              type="button"
              className={BTN}
              disabled={busy || problems.includes("unreachable")}
              onClick={() => act("/api-proxy/v1/adguard/protection", { enabled: !st.protection }, st.protection ? "Protection switched off." : "Protection switched on.")}
            >
              {st.protection ? "Turn protection off" : "Turn protection on"}
            </button>
          </div>
        )}
      </div>

      {problems.length > 0 && (
        <ul className="rounded-lg border border-flag-border bg-flag-bg px-3.5 py-2.5 text-sm text-flag space-y-1">
          {problems.map((p) => <li key={p}>{PROBLEM_TEXT[p] ?? p}</li>)}
          {st.error && <li className="text-xs opacity-80">{st.error}</li>}
        </ul>
      )}
      {msg && (
        <p className={`rounded-lg border px-3.5 py-2 text-sm ${msg.tone === "ok" ? "border-safe/20 bg-safe/10 text-safe" : "border-flag-border bg-flag-bg text-flag"}`}>{msg.text}</p>
      )}

      <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        {[
          ["Protection", st.protection ? "On" : "Off"],
          ["Rules", String(st.rule_count ?? 0)],
          ["Blocked today", String(st.blocked_today ?? 0)],
          ["Last sync", st.last_sync_at ? formatDateTimeWIB(st.last_sync_at) : "never"],
          ["Blocking mode", st.blocking_mode ?? "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-background px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-chalk-faint">{k}</dt>
            <dd className="font-medium text-chalk tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {st.version && <p className="text-xs text-chalk-faint">AdGuard Home {st.version}. Blocking mode is read-only here (set ADGUARD_BLOCKING_MODE).</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-chalk-faint mb-1.5">Check a domain</h3>
          <div className="flex gap-2">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runCheck()}
              placeholder="example.com"
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-line bg-background text-sm font-mono text-chalk placeholder-chalk-faint focus:border-primary focus:outline-none"
            />
            <button type="button" className={BTN} onClick={() => void runCheck()}>Check</button>
          </div>
          {checkErr && <p className="mt-2 text-xs text-flag">{checkErr}</p>}
          {check && (
            <p className="mt-2 text-sm text-chalk-dim">
              <strong className="font-mono text-chalk">{check.domain}</strong> would be{" "}
              <strong className={check.would_block ? "text-flag" : "text-safe"}>{check.would_block ? "blocked" : "allowed"}</strong>
              {check.rule ? <> by <span className="font-mono text-chalk">{check.rule}</span></> : null}
              {check.never_block ? " (on the never-block list)" : ""}.
            </p>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-chalk-faint mb-1.5">Never-block list</h3>
          {neverBlock.length === 0 ? (
            <p className="text-xs text-chalk-faint">Empty. Set MSDA_NEVER_BLOCK to protect infrastructure domains (dashboard, NTP, upstream DNS, notification services).</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {neverBlock.map((d) => <span key={d} className="px-2 py-0.5 rounded bg-surface-3 border border-line text-xs font-mono text-chalk-dim">{d}</span>)}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="border-t border-line pt-3">
          {!confirmDoh ? (
            <button type="button" className={BTN} disabled={busy} onClick={() => setConfirmDoh(true)}>Block public DoH resolvers…</button>
          ) : (
            <div className="rounded-lg border border-watch-border bg-watch-bg p-3 space-y-2 text-sm text-chalk-dim">
              <p>
                Browsers and phones using DNS-over-HTTPS can bypass DNS blocking. This blocks the public resolvers below so they fall back to the network DNS.
                Do not do this if AdGuard or any device uses one of them by name.
              </p>
              <p className="font-mono text-xs text-chalk">{DOH_PRESET.join(", ")}</p>
              <div className="flex gap-2">
                <button type="button" className={BTN} onClick={() => void addDoh()}>Add and block</button>
                <button type="button" className={BTN} onClick={() => setConfirmDoh(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
