import { CircleInfo, Cpus, Display, Bell } from "@gravity-ui/icons";
import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import { TopDomains } from "@/components/TopDomains";
import { AlertsFeed } from "@/components/AlertsFeed";
import { ActivityLog } from "@/components/ActivityLog";
import { LabTabs } from "@/components/LabTabs";
import {
  fetchSummary,
  fetchLabGrid,
  fetchTopDomains,
  fetchNotifications,
  ACCESS_POINTS,
  LAB_SEATS,
  seatsForLab,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Fetch paralel dari Go backend
  const [summary, labGrid, topDomains, notifs] = await Promise.all([
    fetchSummary("today").catch(() => null),
    fetchLabGrid(8).catch(() => []),
    fetchTopDomains({ limit: 5 }).catch(() => []),
    fetchNotifications(1, 5).catch(() => ({ data: [], meta: { total: 0, page: 1, limit: 5, total_pages: 0 } })),
  ]);

  // Bangun latestBySeat dari labGrid (data real dari Go backend)
  // Map to DnsEvent-like shape: only domain + timestamp are used by LabGrid
  const latestBySeatMap: Record<string, { domain: string; timestamp: string }> = {};
  for (const ap of labGrid) {
    for (const client of ap.clients) {
      latestBySeatMap[client.client_ip] = {
        domain:    client.last_domain,
        timestamp: client.last_seen,
      };
    }
  }

  const totalSeats = LAB_SEATS.length; // 108
  const unreadCount = notifs.data.filter((n) => !n.is_read).length;

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">

        {/* ── Header ── */}
        <header className="flex flex-col gap-3 rounded-2xl border border-line bg-surface chalk-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-data text-xs uppercase tracking-[0.24em] text-chalk-faint">
              SATA · Smart AP Traffic Analyzer
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-chalk sm:text-3xl">
              Pengawasan Lab Komputer
            </h1>
            <p className="mt-1 text-sm text-chalk-dim">
              3 lab · 36 PC per lab · trafik DNS per access point dipantau real-time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-safe/30 bg-safe/10 px-3 py-1.5 text-xs font-medium text-safe">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-safe" />
              Pipeline aktif
            </span>
            {/* Notifikasi bell */}
            <Link
              href="/notifications"
              className="relative flex items-center justify-center rounded-full border border-line bg-surface-2 p-2 hover:bg-surface transition-colors"
              title="Notifikasi"
            >
              <Bell width={16} height={16} className="text-chalk-dim" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-flag text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            {/* Nav links */}
            <Link href="/blacklist" className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-chalk-dim hover:text-chalk transition-colors">
              Blacklist
            </Link>
            <Link href="/dns-info" className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-chalk-dim hover:text-chalk transition-colors">
              DNS Info
            </Link>
            <Link href="/client-access" className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-chalk-dim hover:text-chalk transition-colors">
              Client Access
            </Link>
            <Link href="/reports" className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-chalk-dim hover:text-chalk transition-colors">
              Laporan
            </Link>
          </div>
        </header>

        {/* ── Stat Cards ── */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Display width={18} height={18} />}
            label="PC aktif"
            value={summary ? `${summary.blacklist_clients > 0 ? totalSeats - summary.blacklist_clients : totalSeats}/${totalSeats}` : "—"}
            detail={`dari ${ACCESS_POINTS.length} lab`}
          />
          <StatCard
            icon={<Cpus width={18} height={18} />}
            label="Total Query"
            value={summary ? String(summary.total_queries) : "—"}
            detail={`${summary?.unique_domains ?? 0} domain unik`}
          />
          <StatCard
            icon={<CircleInfo width={18} height={18} />}
            label="Blacklist Hits"
            value={summary ? String(summary.blacklist_hits) : "—"}
            detail={`${summary?.blacklist_clients ?? 0} klien terlibat`}
          />
          <StatCard
            icon={<Bell width={18} height={18} />}
            label="Notifikasi"
            value={String(notifs.meta.total)}
            detail={unreadCount > 0 ? `${unreadCount} belum dibaca` : "semua dibaca"}
          />
        </section>

        {/* ── Lab Tabs (denah 3 lab dari data real) ── */}
        <LabTabs
          labs={ACCESS_POINTS.map((ap, idx) => ({
            ap,
            seats:            seatsForLab(idx + 1),
            latestBySeatJson: latestBySeatMap,
          }))}
        />

        {/* ── Alerts + Top Domains ── */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <AlertsFeed labGrid={labGrid} />
          <TopDomains domains={topDomains} />
        </section>

        {/* ── Activity Log ── */}
        <ActivityLog labGrid={labGrid} />

        <p className="text-center text-xs text-chalk-faint">
          Data dari Go Backend API · 3 lab · 36 PC per lab · refresh untuk memperbarui
        </p>
      </div>
    </main>
  );
}
