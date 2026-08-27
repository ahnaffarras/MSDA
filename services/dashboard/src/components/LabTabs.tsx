"use client";

import { useState } from "react";
import { LabGrid } from "./LabGrid";
import type { LabSeat } from "@/lib/types";

interface LabTabProps {
  labs: {
    ap:               { ap_ip: string; ap_name: string };
    seats:            (LabSeat & { lab_id: number })[];
    latestBySeatJson: Record<string, { domain: string; timestamp: string }>;
  }[];
}

export function LabTabs({ labs }: LabTabProps) {
  const [active, setActive] = useState(0);

  return (
    <article className="rounded-2xl border border-line bg-surface chalk-surface overflow-hidden">
      {/* ── Tab bar ── */}
      <div className="flex border-b border-line">
        {labs.map((lab, idx) => {
          const isActive    = idx === active;
          const activeCount = lab.seats.filter((s) =>
            s.client_ip in lab.latestBySeatJson
          ).length;

          return (
            <button
              key={lab.ap.ap_ip}
              onClick={() => setActive(idx)}
              className="flex flex-1 flex-col items-center gap-0.5 px-4 py-3 text-sm transition-colors"
              style={{
                borderBottom: isActive ? "2px solid var(--accent-safe)" : "2px solid transparent",
                color:        isActive ? "var(--chalk)"                  : "var(--chalk-dim)",
                background:   isActive ? "var(--surface)"                : "var(--surface-2)",
              }}
              aria-selected={isActive}
            >
              <span className="font-display font-semibold">{lab.ap.ap_name}</span>
              <span className="font-data text-xs" style={{ color: "var(--chalk-faint)" }}>
                {activeCount}/{lab.seats.length} PC aktif
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Grid lab aktif ── */}
      <div className="p-5">
        {labs.map((lab, idx) => {
          // Semua tab di-render tapi hanya yang aktif yang ditampilkan
          // (mencegah state reset saat ganti tab)
          const latestBySeat = new Map(Object.entries(lab.latestBySeatJson));
          return (
            <div key={lab.ap.ap_ip} hidden={idx !== active}>
              <LabGrid
                seats={lab.seats}
                latestBySeat={latestBySeat}
                apName={lab.ap.ap_name}
              />
            </div>
          );
        })}
      </div>
    </article>
  );
}
