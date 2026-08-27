/**
 * GET /api/stats
 *
 * Menghitung ringkasan statistik untuk StatCard di halaman utama.
 * Secara default mengambil data 24 jam terakhir.
 *
 * Query params:
 *   ap_ip   — filter by access point IP (optional)
 *   hours   — rentang waktu dalam jam, default 24
 *
 * Response:
 * {
 *   active_seats:  number,   // IP klien unik yang aktif
 *   total_queries: number,   // total event dalam rentang
 *   flagged_count: number,   // event dengan risk_level flag | watch
 *   top_domain:    string | null,
 *   top_domain_share: number // persentase dari total
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const apIp = searchParams.get("ap_ip");
    const hours = Math.min(Number(searchParams.get("hours") ?? 24), 168); // max 1 week

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const db = await getDb();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = { timestamp: { $gt: since } };
    if (apIp) matchStage.ap_ip = apIp;

    const [result] = await db
      .collection("dns_events")
      .aggregate([
        { $match: matchStage },
        {
          $facet: {
            // Jumlah total event
            total: [{ $count: "count" }],
            // IP klien unik
            active_seats: [
              { $group: { _id: "$client_ip" } },
              { $count: "count" },
            ],
            // Event berisiko (flag atau watch)
            flagged: [
              { $match: { risk_level: { $in: ["flag", "watch"] } } },
              { $count: "count" },
            ],
            // Domain paling sering muncul
            top_domains: [
              { $group: { _id: "$domain", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 1 },
            ],
          },
        },
      ])
      .toArray();

    const total         = result?.total?.[0]?.count         ?? 0;
    const activeSeats   = result?.active_seats?.[0]?.count  ?? 0;
    const flaggedCount  = result?.flagged?.[0]?.count        ?? 0;
    const topDomainDoc  = result?.top_domains?.[0];

    return NextResponse.json({
      active_seats:      activeSeats,
      total_queries:     total,
      flagged_count:     flaggedCount,
      top_domain:        topDomainDoc?._id ?? null,
      top_domain_share:  total > 0 ? Math.round((topDomainDoc?.count / total) * 100) : 0,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/stats]", err);
    return NextResponse.json(
      { error: "Gagal mengambil statistik dari database." },
      { status: 500 }
    );
  }
}
