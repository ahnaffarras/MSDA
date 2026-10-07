import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  formatDateLabel,
  formatTimestamp,
  buildReportText,
  buildRawData,
  type DnsAiReportDoc,
  type DnsDailyStatsDoc,
} from "@/lib/report-format";

/**
 * GET /api/reports
 * Membaca laporan harian dari koleksi `dns_ai_reports` (ditulis n8n workflow v8)
 * dan digabungkan dengan `dns_daily_stats` berdasarkan field `date` (format YYYY-MM-DD, zona WIB).
 * Mengembalikan array laporan terurut tanggal terbaru (limit 30).
 */
export async function GET() {
  try {
    const db = await getDb();

    // 1. Ambil laporan harian AI terurut berdasarkan date desc, limit 30
    const aiReports = await db
      .collection<DnsAiReportDoc>("dns_ai_reports")
      .find({})
      .sort({ date: -1 })
      .limit(30)
      .toArray();

    // 2. Kumpulkan seluruh tanggal untuk query dns_daily_stats dalam SATU query ($in)
    const dates = aiReports.map((r) => r.date).filter(Boolean);
    const dailyStatsList =
      dates.length > 0
        ? await db
            .collection<DnsDailyStatsDoc>("dns_daily_stats")
            .find({ date: { $in: dates } })
            .toArray()
        : [];

    // 3. Buat lookup Map berdasarkan date
    const dailyStatsMap = new Map<string, DnsDailyStatsDoc>();
    for (const stat of dailyStatsList) {
      if (stat.date) {
        dailyStatsMap.set(stat.date, stat);
      }
    }

    // 4. Petakan dokumen ke bentuk response standar dashboard
    const responseData = aiReports.map((report) => {
      const stats = report.date ? dailyStatsMap.get(report.date) : undefined;

      const rawRows =
        typeof stats?.total_requests === "number"
          ? stats.total_requests
          : (report.summary?.total_requests?.today ?? 0);

      const apCount = Array.isArray(stats?.per_ap)
        ? stats.per_ap.length
        : (Array.isArray(report.trends?.ap_totals) ? report.trends.ap_totals.length : 0);

      return {
        _id: String(report._id),
        timestamp: formatTimestamp(report.generated_at, report.date),
        date_label: formatDateLabel(report.date, report.partial),
        report_text: buildReportText(report, stats),
        raw_rows: rawRows,
        ap_count: apCount,
        raw_data: buildRawData(stats),
      };
    });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[reports GET]", error);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
