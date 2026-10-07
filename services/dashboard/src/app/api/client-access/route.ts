import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "200");

  try {
    const db = await getDb();

    // Pastikan hanya dokumen valid (punya domain) dan diurutkan terbaru (_id: -1)
    const logs = await db
      .collection("ip_access_dns")
      .find({ domain: { $exists: true, $ne: null } })
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Client Access API Error:", error);
    return NextResponse.json([]);
  }
}
