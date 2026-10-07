"use client";

import { useState } from "react";
import { Display } from "@gravity-ui/icons";
import type { LabSeat } from "@/lib/types";
import { classifyDomain, RISK_COLOR, RISK_LABEL } from "@/lib/domain-risk";
import { formatTimeWIB } from "@/lib/format";

export function LabGrid({
  seats,
  latestBySeat,
  apName,
}: {
  seats: (LabSeat & { lab_id?: number })[];
  latestBySeat: Map<string, { domain: string; timestamp: string }>;
  /** Nama lab opsional — ditampilkan di judul jika disediakan */
  apName?: string;
}) {
  const [selected, setSelected] = useState<LabSeat | null>(null);
  const selectedEvent = selected ? latestBySeat.get(selected.client_ip) : undefined;

  // Reset seleksi kalau seats berubah (ganti tab lab)
  const handleSelect = (seat: LabSeat) => {
    setSelected((prev) => (prev?.client_ip === seat.client_ip ? null : seat));
  };

  return (
    <div>
      {/* Header — hanya tampil jika dipanggil standalone (bukan dari LabTabs) */}
      {!apName && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-chalk">Lab layout</h2>
            <p className="text-sm text-chalk-dim">Last domain accessed by each PC</p>
          </div>
          <Legend />
        </div>
      )}

      {apName && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-chalk-dim">
            Last domain accessed by each PC · {seats.length} seats
          </p>
          <Legend />
        </div>
      )}

      {/* Papan tulis */}
      <div className="mb-3 rounded-md border border-dashed border-line py-1.5 text-center text-[11px] tracking-[0.2em] text-chalk-faint">
        WHITEBOARD
      </div>

      {/* Grid — 36 PC: 6 kolom × 6 baris */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {seats.map((seat) => {
          const event    = latestBySeat.get(seat.client_ip);
          const risk     = event ? classifyDomain(event.domain) : "safe";
          const colors   = RISK_COLOR[risk];
          const isSel    = selected?.client_ip === seat.client_ip;
          const inactive = !event;

          return (
            <button
              key={seat.client_ip}
              onClick={() => handleSelect(seat)}
              className="flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors"
              style={{
                borderColor:     isSel    ? colors.fg         : "var(--line)",
                backgroundColor: isSel    ? colors.bg
                                : inactive ? "var(--surface-2)" : "var(--surface)",
                opacity: inactive ? 0.45 : 1,
              }}
              aria-pressed={isSel}
              title={event ? `${seat.student_label}: ${event.domain}` : `${seat.student_label} — inactive`}
            >
              <Display
                width={14}
                height={14}
                style={{ color: inactive ? "var(--chalk-faint)" : colors.fg }}
              />
              <span className="font-data text-[10px] text-chalk-dim leading-none">
                {seat.student_label}
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: inactive ? "var(--line)" : colors.fg }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {/* Detail PC yang dipilih */}
      {selected && selectedEvent && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
          style={{ borderColor: RISK_COLOR[classifyDomain(selectedEvent.domain)].fg }}
        >
          <div>
            <p className="text-sm text-chalk">
              <span className="font-medium">{selected.student_label}</span>{" "}
              <span className="font-data text-chalk-dim">({selected.client_ip})</span>
            </p>
            <p className="font-data text-sm text-chalk-dim">{selectedEvent.domain}</p>
            <p
              className="mt-0.5 text-xs font-medium"
              style={{ color: RISK_COLOR[classifyDomain(selectedEvent.domain)].fg }}
            >
              {RISK_LABEL[classifyDomain(selectedEvent.domain)]}
            </p>
          </div>
          <p className="font-data text-xs text-chalk-faint">
            {formatTimeWIB(selectedEvent.timestamp)} WIB
          </p>
        </div>
      )}

      {selected && !selectedEvent && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="text-sm text-chalk-dim">
            <span className="font-medium text-chalk">{selected.student_label}</span> —{" "}
            no DNS activity in this session yet.
          </p>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-chalk-dim">
      {(["safe", "watch", "flag"] as const).map((level) => (
        <span key={level} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: RISK_COLOR[level].fg }}
          />
          {RISK_LABEL[level]}
        </span>
      ))}
    </div>
  );
}
