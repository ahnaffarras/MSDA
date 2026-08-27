/**
 * GET /api/reports
 *
 * Mengembalikan laporan AI harian yang telah diarsipkan oleh
 * workflow n8n (sata-daily-report) ke koleksi `ai_reports`.
 *
 * Query params:
 *   limit — jumlah laporan yang dikembalikan, default 7 (1 minggu), max 30
 *
 * Response:
 * {
 *   date_label:  string;
 *   report_text: string;
 *   raw_rows:    number;
 *   ap_count:    number;
 *   created_at?: string;
 * }[]
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(Number(searchParams.get("limit") ?? 7), 30);

    const db = await getDb();

    const docs = await db
      .collection("ai_reports")
      .find({})
      .sort({ _id: -1 }) // terbaru dulu (ObjectId mengandung timestamp)
      .limit(limit)
      .project({
        _id: 0,
        date_label:  1,
        report_text: 1,
        raw_rows:    1,
        ap_count:    1,
        created_at:  1,
      })
      .toArray();

    return NextResponse.json(docs, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/reports]", err);
    return NextResponse.json(
      { error: "Gagal mengambil laporan AI dari database." },
      { status: 500 }
    );
  }
}
