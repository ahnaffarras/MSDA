"use client";

import { useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/lib/useLoad";

type ClientAccessLog = {
  _id: string;
  timestamp: string;
  domain: string;
  client_ip: string;
  group: string;
  type: string;
  action: string;
  enforced?: boolean;
  ap_info?: {
    label?: string;
    ip?: string;
  };
  ap_name?: string;
  ap_ip?: string;
};

function getLogTime(log: ClientAccessLog): number {
  if (log.timestamp) {
    const t = new Date(log.timestamp).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (log._id && typeof log._id === "string" && log._id.length >= 8) {
    const sec = parseInt(log._id.substring(0, 8), 16);
    if (!isNaN(sec) && sec > 0) return sec * 1000;
  }
  return 0;
}

export default function ClientAccessPage() {
  const [logs, setLogs] = useState<ClientAccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  const fetchLogs = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/client-access?limit=200");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Polling realtime setiap 5 detik agar query baru langsung muncul
  useLoad(fetchLogs, 5_000);

  // Urutkan data secara descending (terbaru di atas, terlama di bawah)
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const tA = getLogTime(a);
      const tB = getLogTime(b);
      if (tA !== tB) return tB - tA;
      return (b._id || "").localeCompare(a._id || "");
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedLogs.filter((log) => {
      const matchSearch =
        !q ||
        log.domain?.toLowerCase().includes(q) ||
        log.client_ip?.toLowerCase().includes(q) ||
        log.ap_info?.label?.toLowerCase().includes(q) ||
        log.ap_name?.toLowerCase().includes(q);
      const matchAction = filterAction === "all" || log.action === filterAction;
      return matchSearch && matchAction;
    });
  }, [sortedLogs, search, filterAction]);

  const totalBlocked = sortedLogs.filter((l) => l.action === "blocked").length;
  const totalAllowed = sortedLogs.filter((l) => l.action === "allowed").length;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Client Access" }]}
        title="Client Access Logs"
        description="Every DNS request made by clients across all labs and classrooms."
        actions={
          <div className="inline-flex items-center gap-2 rounded-lg border-2 border-safe-border bg-safe-bg px-4 py-2 shadow-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-safe opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-safe"></span>
            </span>
            <span className="text-sm font-semibold text-safe">REALTIME · 5s</span>
          </div>
        }
      />

      <div className="page-x py-6 md:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-surface rounded-xl border border-line p-4">
            <p className="text-xs text-chalk-faint mb-1">Total logs</p>
            <p className="text-2xl font-bold text-chalk font-mono">
              {sortedLogs.length.toLocaleString("en-GB")}
            </p>
          </div>
          <div className="bg-surface rounded-xl border border-safe/20 p-4">
            <p className="text-xs text-chalk-faint mb-1">Allowed</p>
            <p className="text-2xl font-bold text-safe font-mono">
              {totalAllowed.toLocaleString("en-GB")}
            </p>
          </div>
          <div className="bg-surface rounded-xl border border-flag/20 p-4">
            <p className="text-xs text-chalk-faint mb-1">Blocked</p>
            <p className="text-2xl font-bold text-flag font-mono">
              {totalBlocked.toLocaleString("en-GB")}
            </p>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-line p-4 md:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-2">
                Search domain / IP / lab
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by domain, client IP or lab name…"
                className="w-full px-4 py-2.5 bg-background border border-line rounded-lg text-chalk placeholder-chalk-faint focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-chalk-dim mb-2">
                Filter by status
              </label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full px-4 py-2.5 bg-background border border-line rounded-lg text-chalk focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="all">All statuses</option>
                <option value="allowed">Allowed</option>
                <option value="blocked">Matched blocklist / blocked</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="border-b border-line px-5 py-4 flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold text-chalk">
              Access logs ({filteredLogs.length})
            </h2>
            <span className="text-xs text-chalk-faint">
              Sorted by newest first
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-3 border-line border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full min-w-[640px] text-left">
                <thead className="bg-background border-b border-line">
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold text-chalk-dim uppercase whitespace-nowrap">
                      Time
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-chalk-dim uppercase">
                      Domain
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-chalk-dim uppercase">
                      Client IP
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-chalk-dim uppercase">
                      Lab / Location
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-chalk-dim uppercase">
                      Category
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-chalk-dim uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-chalk-faint text-sm">
                        No logs found
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log, index) => {
                      const timeMs = getLogTime(log);
                      const timeStr = timeMs
                        ? new Date(timeMs).toLocaleString("en-GB", {
                            timeZone: "Asia/Jakarta",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })
                        : "-";

                      const apLabel = log.ap_info?.label || log.ap_name;
                      const apIp = log.ap_info?.ip || log.ap_ip;

                      return (
                        <tr
                          key={log._id || `${log.timestamp}-${index}`}
                          className="hover:bg-surface-2 transition-colors"
                        >
                          <td className="px-5 py-3 text-sm text-chalk-dim font-mono whitespace-nowrap">
                            {timeStr}
                          </td>
                          <td className="px-5 py-3 text-sm text-chalk font-mono font-medium max-w-xs truncate">
                            {log.domain || "-"}
                          </td>
                          <td className="px-5 py-3 text-sm text-primary font-mono whitespace-nowrap">
                            {log.client_ip || "-"}
                          </td>
                          <td className="px-5 py-3 text-sm">
                            {apLabel ? (
                              <div className="truncate max-w-[200px]">
                                <span className="text-chalk font-medium">{apLabel}</span>
                                {apIp && (
                                  <span className="text-chalk-faint text-xs ml-1.5 font-mono">
                                    ({apIp})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-chalk-faint">-</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-sm text-chalk-dim">
                            {log.group || "-"}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            {log.action === "blocked" && log.enforced === true ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-flag/10 text-flag rounded text-xs font-medium border border-flag/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-flag"></span>
                                Blocked
                              </span>
                            ) : log.action === "blocked" ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-watch/10 text-watch rounded text-xs font-medium border border-watch/20" title="Matched the blocklist in Monitor mode; the client could still open it">
                                <span className="w-1.5 h-1.5 rounded-full bg-watch"></span>
                                Matched blocklist (monitor)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-safe/10 text-safe rounded text-xs font-medium border border-safe/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-safe"></span>
                                Allowed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
