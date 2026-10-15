import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ipMaskerFor } from "@/lib/privacy-settings";
import type { AvailableIP, DnsEvent, IPMapping } from "@/lib/types";

/**
 * GET /api/available-ips
 * Returns unique client IPs from dns_events with metadata
 * Query params:
 *   - hours: number of hours to look back (default: 24)
 *   - include_mapped: include already mapped IPs (default: false)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Dibatasi 1–720 jam agar permintaan tidak memindai seluruh koleksi
    const hours = Math.min(720, Math.max(1, parseInt(searchParams.get("hours") || "24", 10) || 24));
    const includeMapped = searchParams.get("include_mapped") === "true";

    const db = await getDb();
    const mask = await ipMaskerFor(request);

    // Get events from the last N hours
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    // Aggregate unique IPs with metadata
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: since }
        }
      },
      {
        $group: {
          _id: "$client_ip",
          ap_ip: { $first: "$ap_ip" },
          ap_name: { $first: "$ap_name" },
          last_seen: { $max: "$timestamp" },
          query_count: { $sum: 1 }
        }
      },
      {
        $sort: { query_count: -1 }
      },
      { $limit: 1000 }
    ];

    const results = await db
      .collection<DnsEvent>("dns_events")
      .aggregate(pipeline)
      .toArray();

    // Get all mapped IPs
    const mappedIPs = await db
      .collection<IPMapping>("ip_mappings")
      .find({})
      .project({ client_ip: 1 })
      .toArray();
    
    const mappedSet = new Set(mappedIPs.map(m => m.client_ip));

    // Build the response
    const availableIPs: AvailableIP[] = results
      .map(r => ({
        client_ip: mask(r._id as string),
        ap_ip: r.ap_ip as string,
        ap_name: r.ap_name as string,
        last_seen: r.last_seen as string,
        query_count: r.query_count as number,
        is_mapped: mappedSet.has(r._id as string) // dihitung dari IP asli, sebelum disamarkan
      }))
      .filter(ip => includeMapped || !ip.is_mapped);

    return NextResponse.json(availableIPs);
  } catch (error) {
    console.error("[available-ips GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch available IPs" },
      { status: 500 }
    );
  }
}
