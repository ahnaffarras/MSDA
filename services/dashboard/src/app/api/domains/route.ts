/**
 * GET /api/domains
 *
 * Mengembalikan top N domain berdasarkan jumlah query DNS,
 * lengkap dengan persentase (share) dari total.
 *
 * Query params:
 *   ap_ip   — filter by access point IP (optional)
 *   limit   — jumlah domain yang dikembalikan, default 5, max 20
 *   hours   — rentang waktu dalam jam, default 24
 *
 * Response:
 * { domain: string; count: number; share: number; risk_level: string }[]
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const apIp = searchParams.get("ap_ip");
    const limit = Math.min(Number(searchParams.get("limit") ?? 5), 20);
    const hours = Math.min(Number(searchParams.get("hours") ?? 24), 168);

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const db = await getDb();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = { timestamp: { $gt: since } };
    if (apIp) matchStage.ap_ip = apIp;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { domain: "$domain", risk_level: "$risk_level" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      // Hitung total untuk share% dalam satu pass
      {
        $group: {
          _id: null,
          items: { $push: { domain: "$_id.domain", risk_level: "$_id.risk_level", count: "$count" } },
          total: { $sum: "$count" },
        },
      },
      { $unwind: "$items" },
      {
        $project: {
          _id: 0,
          domain:     "$items.domain",
          risk_level: "$items.risk_level",
          count:      "$items.count",
          share: {
            $round: [{ $multiply: [{ $divide: ["$items.count", "$total"] }, 100] }, 0],
          },
        },
      },
      { $sort: { count: -1 } },
    ];

    const docs = await db.collection("dns_events").aggregate(pipeline).toArray();

    return NextResponse.json(docs, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/domains]", err);
    return NextResponse.json(
      { error: "Gagal mengambil data domain dari database." },
      { status: 500 }
    );
  }
}
