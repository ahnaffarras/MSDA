import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ipMaskerFor } from "@/lib/privacy-settings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Dibatasi 1–1000 agar permintaan tak bisa menarik seluruh koleksi
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") || "200", 10) || 200));

  try {
    const db = await getDb();
    const mask = await ipMaskerFor(request);

    // Pastikan hanya dokumen valid (punya domain) dan diurutkan terbaru (_id: -1)
    const logs = await db
      .collection("ip_access_dns")
      .find({ domain: { $exists: true, $ne: null } })
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(logs.map((l) => ({ ...l, client_ip: mask(l.client_ip) })));
  } catch (error) {
    console.error("Client Access API Error:", error);
    return NextResponse.json([]);
  }
}
