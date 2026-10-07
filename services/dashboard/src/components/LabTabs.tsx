"use client";

import { useState } from "react";
import { useLoad } from '@/lib/useLoad';
import { LabGrid } from "./LabGrid";
import type { LabConfig, IPMapping, DnsEvent, LabSeat } from "@/lib/types";

interface LabTabsProps {
  // Optional: pass pre-fetched data for SSR/static scenarios
  initialLabs?: LabConfig[];
  initialMappings?: IPMapping[];
}

export function LabTabs({ initialLabs, initialMappings }: LabTabsProps) {
  const [labs, setLabs] = useState<LabConfig[]>(initialLabs || []);
  const [mappings, setMappings] = useState<IPMapping[]>(initialMappings || []);
  const [recentEvents, setRecentEvents] = useState<DnsEvent[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(!initialLabs);

  const fetchData = async () => {
    try {
      const [labsRes, mappingsRes, eventsRes] = await Promise.all([
        fetch("/api/lab-config"),
        fetch("/api/ip-mappings"),
        fetch("/api/events?limit=100"),
      ]);

      const labsData = await labsRes.json();
      const mappingsData = await mappingsRes.json();
      const eventsData = await eventsRes.json();

      // Only show active labs
      const activeLabs = labsData.filter((lab: LabConfig) => lab.is_active);
      
      setLabs(activeLabs);
      setMappings(mappingsData);
      setRecentEvents(eventsData);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch lab data:", error);
      setLoading(false);
    }
  };

  useLoad(fetchData, 15000)

  if (loading) {
    return (
      <article className="rounded-2xl border border-line bg-surface chalk-surface overflow-hidden">
        <div className="p-12 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-line border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      </article>
    );
  }

  if (labs.length === 0) {
    return (
      <article className="rounded-2xl border border-line bg-surface chalk-surface overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-surface-2 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8"
              style={{ color: "var(--chalk-dim)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p style={{ color: "var(--chalk-dim)" }} className="mb-2">
            No labs configured yet
          </p>
          <p style={{ color: "var(--chalk-faint)" }} className="text-sm mb-4">
            Create a group in Settings to start monitoring
          </p>
          <a
            href="/settings"
            className="inline-block px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors text-sm font-medium"
          >
            Go to Settings
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-line bg-surface chalk-surface overflow-hidden">
      {/* ── Tab bar ── */}
      <div className="flex overflow-x-auto border-b border-line">
        {labs.map((lab, idx) => {
          const isActive = idx === active;
          
          // Get mapped IPs for this lab
          const labMappings = mappings.filter((m) => m.lab_id === lab.id);
          const labIPs = new Set(labMappings.map((m) => m.client_ip));
          
          // Count active clients (those with recent events)
          const activeCount = recentEvents.filter(
            (e) => labIPs.has(e.client_ip)
          ).length;

          return (
            <button
              key={lab.id}
              onClick={() => setActive(idx)}
              className="flex flex-1 flex-col items-center gap-0.5 px-4 py-3 text-sm transition-colors min-w-[120px]"
              style={{
                borderBottom: isActive
                  ? "2px solid var(--accent-safe)"
                  : "2px solid transparent",
                color: isActive ? "var(--chalk)" : "var(--chalk-dim)",
                background: isActive ? "var(--surface)" : "var(--surface-2)",
              }}
              aria-pressed={isActive}
            >
              <span className="font-display font-semibold truncate max-w-full">
                {lab.name}
              </span>
              <span
                className="font-data text-xs"
                style={{ color: "var(--chalk-faint)" }}
              >
                {activeCount}/{labMappings.length} PCs active
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Grid lab aktif ── */}
      <div className="p-5">
        {labs.map((lab, idx) => {
          if (idx !== active) return null;

          // Get seats (IP mappings) for this lab
          const labSeats: LabSeat[] = mappings
            .filter((m) => m.lab_id === lab.id)
            .map((m) => ({
              seat: m.seat,
              client_ip: m.client_ip,
              student_label: m.label,
            }))
            .sort((a, b) => a.seat - b.seat);

          // Build latest event map for each client IP
          const latestBySeat = new Map<string, DnsEvent>();
          for (const event of recentEvents) {
            if (
              labSeats.some((s) => s.client_ip === event.client_ip) &&
              !latestBySeat.has(event.client_ip)
            ) {
              latestBySeat.set(event.client_ip, event);
            }
          }

          return (
            <div key={lab.id}>
              {labSeats.length === 0 ? (
                <div className="text-center py-12">
                  <p style={{ color: "var(--chalk-dim)" }} className="mb-2">
                    No PCs mapped to this lab yet
                  </p>
                  <p style={{ color: "var(--chalk-faint)" }} className="text-sm mb-4">
                    Add IP mapping in Settings page
                  </p>
                  <a
                    href="/settings"
                    className="inline-block px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors text-sm font-medium"
                  >
                    Map IPs to this lab
                  </a>
                </div>
              ) : (
                <LabGrid
                  seats={labSeats}
                  latestBySeat={latestBySeat}
                  apName={lab.name}
                />
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
