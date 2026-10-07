import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import type { LabConfig } from "@/lib/types";

/**
 * GET /api/lab-config
 * Returns all lab configurations, ordered by 'order' field
 */
export async function GET() {
  try {
    const db = await getDb();
    const configs = await db
      .collection<LabConfig>("lab_configs")
      .find({})
      .sort({ order: 1 })
      .toArray();

    // Transform _id to id
    const transformedConfigs = configs.map(config => ({
      ...config,
      id: config._id.toString(),
      _id: undefined
    }));

    return NextResponse.json(transformedConfigs);
  } catch (error) {
    console.error("[lab-config GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch lab configs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lab-config
 * Create a new lab configuration
 * Body: { name: string, ap_ip: string, network_type?: NetworkType, description?: string, order?: number, is_active?: boolean }
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { 
      name, 
      ap_ip, 
      network_type = 'Network',
      description,
      order, 
      is_active = true 
    } = body;

    if (!name || !ap_ip) {
      return NextResponse.json(
        { error: "name and ap_ip are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Get the highest order number if order not provided
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxOrderDoc = await db
        .collection<LabConfig>("lab_configs")
        .find({})
        .sort({ order: -1 })
        .limit(1)
        .toArray();
      finalOrder = maxOrderDoc.length > 0 ? (maxOrderDoc[0].order || 0) + 1 : 1;
    }

    const newConfig: Omit<LabConfig, "id"> = {
      name,
      ap_ip,
      network_type,
      description,
      order: finalOrder,
      is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.collection("lab_configs").insertOne(newConfig);

    return NextResponse.json(
      { ...newConfig, id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("[lab-config POST]", error);
    return NextResponse.json(
      { error: "Failed to create lab config" },
      { status: 500 }
    );
  }
}
