import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin";
import type { LabConfig } from "@/lib/types";

/**
 * PUT /api/lab-config/[id]
 * Update a lab configuration
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, ap_ip, network_type, description, order, is_active } = body;

    const updateFields: Partial<Omit<LabConfig, "id" | "created_at">> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateFields.name = name;
    if (ap_ip !== undefined) updateFields.ap_ip = ap_ip;
    if (network_type !== undefined) updateFields.network_type = network_type;
    if (description !== undefined) updateFields.description = description;
    if (order !== undefined) updateFields.order = order;
    if (is_active !== undefined) updateFields.is_active = is_active;

    const db = await getDb();
    const result = await db
      .collection<LabConfig>("lab_configs")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Lab config not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    console.error("[lab-config PUT]", error);
    return NextResponse.json(
      { error: "Failed to update lab config" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/lab-config/[id]
 * Delete a lab configuration and all its IP mappings
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    
    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }
    
    const db = await getDb();
    const objectId = new ObjectId(id);

    // Delete the lab config
    const result = await db
      .collection<LabConfig>("lab_configs")
      .deleteOne({ _id: objectId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Network not found" }, { status: 404 });
    }

    // Delete all associated IP mappings
    await db.collection("ip_mappings").deleteMany({ lab_id: id });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("[lab-config DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete network" },
      { status: 500 }
    );
  }
}
