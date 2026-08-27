"use client";

import { useState, useEffect } from "react";
import { FileText } from "@gravity-ui/icons";
import { fetchReports } from "@/lib/api";
import type { AIReport } from "@/lib/types";
import { formatTimeWIB } from "@/lib/format";

export default function ReportsPage() {
  const [reports, setReports] = useState<AIReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchReports(page, 10);
      setReports(res.data);
      setTotalPages(res.meta.total_pages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page]);

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-semibold text-chalk">Laporan Harian AI</h1>
          <p className="text-sm text-chalk-dim">Ringkasan trafik DNS yang dihasilkan oleh Gemini AI</p>
        </header>

        {error && <div className="mb-4 rounded-lg border border-flag bg-flag/10 p-3 text-sm text-flag">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-chalk-dim">Memuat...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-chalk-dim">Belum ada laporan.</div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const isExpanded = expanded === report.id;
              return (
                <article
                  key={report.id}
                  className="rounded-2xl border border-line bg-surface chalk-surface overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : report.id)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-surface-2/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-safe/10">
                        <FileText width={18} height={18} className="text-safe" />
                      </div>
                      <div>
                        <h2 className="font-display text-sm font-semibold text-chalk">{report.date_label}</h2>
                        <p className="font-data text-xs text-chalk-dim">
                          {report.raw_rows} entri DNS · {report.ap_count} AP
                        </p>
                      </div>
                    </div>
                    <span className="font-data text-xs text-chalk-faint">
                      {formatTimeWIB(report.timestamp)}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-line p-5">
                      <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-chalk-dim">
                        {report.report_text}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-chalk-dim hover:text-chalk disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <span className="font-data text-sm text-chalk-dim">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-chalk-dim hover:text-chalk disabled:opacity-40"
            >
              Selanjutnya
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
