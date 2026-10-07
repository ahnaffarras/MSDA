import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin";
import type { IPMapping, DeviceType } from "@/lib/types";

/**
 * GET /api/ip-mappings?lab_id=xxx
 * Returns IP mappings for a specific lab or all mappings
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const labId = searchParams.get("lab_id");

    const db = await getDb();
    const query = labId ? { lab_id: labId } : {};
    
    const mappings = await db
      .collection<IPMapping>("ip_mappings")
      .find(query)
      .sort({ seat: 1 })
      .toArray();

    // Transform _id to id
    const transformedMappings = mappings.map(mapping => ({
      ...mapping,
      id: mapping._id.toString(),
      _id: undefined
    }));

    return NextResponse.json(transformedMappings);
  } catch (error) {
    console.error("[ip-mappings GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch IP mappings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ip-mappings
 * Create a new IP mapping
 * Body: { lab_id: string, client_ip: string, device_type: DeviceType, seat: number, label: string, description?: string }
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { lab_id, client_ip, device_type = 'PC' as DeviceType, seat, label, description } = body;

    if (!lab_id || !client_ip || !seat || !label) {
      return NextResponse.json(
        { error: "lab_id, client_ip, seat, and label are required" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Check if this IP is already mapped
    const existing = await db
      .collection<IPMapping>("ip_mappings")
      .findOne({ client_ip });

    if (existing) {
      return NextResponse.json(
        { error: "This IP is already mapped to a lab" },
        { status: 400 }
      );
    }

    const newMapping: Omit<IPMapping, "id"> = {
      lab_id,
      client_ip,
      device_type,
      seat,
      label,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.collection("ip_mappings").insertOne(newMapping);

    return NextResponse.json(
      { ...newMapping, id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("[ip-mappings POST]", error);
    return NextResponse.json(
      { error: "Failed to create IP mapping" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ip-mappings
 * Bulk delete IP mappings
 * Body: { ids: string[] } or { lab_id: string, client_ips: string[] }
 */
export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { ids, lab_id, client_ips } = body;

    const db = await getDb();
    
    let result;
    if (ids && Array.isArray(ids)) {
      // Delete by IDs
      const objectIds = ids.map(id => new ObjectId(id));
      result = await db.collection("ip_mappings").deleteMany({ _id: { $in: objectIds } });
    } else if (lab_id && client_ips && Array.isArray(client_ips)) {
      // Delete specific IPs from a lab
      result = await db.collection("ip_mappings").deleteMany({
        lab_id,
        client_ip: { $in: client_ips }
      });
    } else {
      return NextResponse.json(
        { error: "Either 'ids' or 'lab_id' with 'client_ips' is required" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error("[ip-mappings DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete IP mappings" },
      { status: 500 }
    );
  }
}
