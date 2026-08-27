/**
 * GET /api/events
 *
 * Query params:
 *   ap_ip    — filter by access point IP (optional)
 *   limit    — max events returned, default 60, max 200
 *   since    — ISO timestamp, only return events after this time (optional)
 *
 * Response: DnsEvent[] (same shape as vector-data-schema.md + risk_level)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { DnsEvent } from "@/lib/types";

export const dynamic = "force-dynamic"; // always fetch fresh, never cache

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const apIp  = searchParams.get("ap_ip");
    const limit = Math.min(Number(searchParams.get("limit") ?? 60), 200);
    const since = searchParams.get("since");

    const db = await getDb();

    // Build MongoDB filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};
    if (apIp)  filter.ap_ip     = apIp;
    if (since) filter.timestamp = { $gt: since };

    const docs = await db
      .collection("dns_events")
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .project<DnsEvent & { risk_level: string }>({
        _id: 0,
        timestamp:   1,
        source_type: 1,
        ap_ip:       1,
        ap_name:     1,
        client_ip:   1,
        domain:      1,
        risk_level:  1,
      })
      .toArray();

    return NextResponse.json(docs, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/events]", err);
    return NextResponse.json(
      { error: "Gagal mengambil data events dari database." },
      { status: 500 }
    );
  }
}
