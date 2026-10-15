import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dateBoundsFor, loadReports } from "@/lib/reports-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports[?range=7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD]
 * Laporan harian dari `dns_ai_reports` (ditulis n8n) + `dns_daily_stats`, terbaru dulu.
 * Tanpa `range`: 30 laporan terakhir. Dengan `range`: laporan pada rentang itu (maks. 120).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const bounds = dateBoundsFor({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  try {
    const rows = await loadReports(await getDb(), { bounds, limit: bounds ? 120 : 30 });
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[reports GET]", error);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
