"use client";

import { useState } from "react";
import { modeLabel, type EnforceStatus } from "@/lib/enforce";
import type { BlacklistEntry } from "@/lib/blacklist";

const CHIP = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border";

/** Chip Mode (Monitor / Block DNS) + chip status sinkronisasi (Synced / Pending / Error). */
export function ModeBadge({ entry }: { entry: Pick<BlacklistEntry, "block_mode" | "enforce_status" | "enforce_error" | "include_subdomains"> }) {
  const enforce = entry.block_mode === "enforce";
  const status = entry.enforce_status as EnforceStatus | undefined;
  return (
    <>
      <span
        className={`${CHIP} ${enforce ? "bg-flag/10 text-flag border-flag/20" : "bg-surface-3 text-chalk-dim border-line"}`}
        title={
          enforce
            ? entry.include_subdomains === false
              ? "Blocked at DNS (this exact domain only)"
              : "Blocked at DNS — the domain and all subdomains cannot be resolved"
            : "Monitor only: matches raise an alert but clients can still open the domain"
        }
      >
        {modeLabel(entry.block_mode)}
      </span>
      {enforce && status === "synced" && (
        <span className={`${CHIP} bg-safe/10 text-safe border-safe/20`} title="Rule is active in AdGuard Home">Synced</span>
      )}
      {enforce && status === "pending" && (
        <span className={`${CHIP} bg-watch/10 text-watch border-watch/20`} title={entry.enforce_error || "Waiting to be synced to AdGuard Home"}>Pending</span>
      )}
      {enforce && status === "error" && (
        <span className={`${CHIP} bg-flag/10 text-flag border-flag/20`} title={entry.enforce_error || "Could not be applied"}>
          Error{entry.enforce_error ? `: ${entry.enforce_error}` : ""}
        </span>
      )}
    </>
  );
}

export interface ModeDialogState {
  /** satu entri (dengan domain) atau massal (jumlah dipilih) */
  entry?: BlacklistEntry;
  bulkCount?: number;
  mode: "alert" | "enforce";
  highImpact?: boolean;
  /** pesan server (mis. confirm_required / never_block) ditampilkan di dialog */
  error?: string;
}

/** Dialog konfirmasi perubahan mode. Block → jelaskan dampak subdomain; domain populer/pendek → ketik ulang domain. */
export function ModeDialog({
  state, busy, onCancel, onConfirm,
}: {
  state: ModeDialogState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (confirmDomain: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const domain = state.entry?.domain ?? "";
  const enforce = state.mode === "enforce";
  const needsTyping = enforce && !!state.highImpact && !!domain;
  const disabled = busy || (needsTyping && typed.trim().toLowerCase() !== domain);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-2xl border border-line max-w-md w-full p-6 space-y-4 shadow-2xl">
        <h3 className="text-base font-semibold text-chalk">
          {enforce
            ? state.bulkCount ? `Block ${state.bulkCount} domain(s) at DNS?` : "Block this domain at DNS?"
            : state.bulkCount ? `Switch ${state.bulkCount} domain(s) to Monitor?` : "Switch to Monitor only?"}
        </h3>

        {enforce ? (
          <p className="text-sm text-chalk-dim leading-relaxed">
            {domain ? <strong className="font-mono text-chalk">{domain}</strong> : "The selected domains"} and{" "}
            <strong className="text-chalk">all of their subdomains</strong> will stop working for every client on the network
            (the DNS answer becomes 0.0.0.0 / NXDOMAIN). You will still get alerts. Clients using DNS-over-HTTPS may bypass this.
          </p>
        ) : (
          <p className="text-sm text-chalk-dim leading-relaxed">
            DNS blocking is removed. Matching queries still raise alerts, but clients can open the domain again.
          </p>
        )}

        {needsTyping && (
          <div>
            <label className="block text-xs font-medium text-chalk-dim mb-1.5">
              This domain is widely used or very short. Type <span className="font-mono text-chalk">{domain}</span> to confirm.
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-line bg-background text-sm font-mono text-chalk focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {state.error && <p className="rounded-lg border border-flag-border bg-flag-bg px-3 py-2 text-xs text-flag">{state.error}</p>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-line bg-surface hover:bg-surface-2 text-sm font-medium text-chalk">
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onConfirm(typed.trim().toLowerCase())}
            className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${enforce ? "bg-flag hover:bg-flag/90" : "bg-primary hover:bg-primary/90"}`}
          >
            {busy ? "Working…" : enforce ? "Yes, block at DNS" : "Switch to Monitor"}
          </button>
        </div>
      </div>
    </div>
  );
}
