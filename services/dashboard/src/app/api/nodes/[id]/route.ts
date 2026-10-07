import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin";
import type { Node } from "@/lib/types";

/**
 * PUT /api/nodes/[id]
 * Update a node
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
    const { name, ap_ip, device_type, description, order, is_active } = body;

    const updateFields: Partial<Omit<Node, "id" | "group_id" | "created_at">> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateFields.name = name;
    if (ap_ip !== undefined) updateFields.ap_ip = ap_ip;
    if (device_type !== undefined) updateFields.device_type = device_type;
    if (description !== undefined) updateFields.description = description;
    if (order !== undefined) updateFields.order = order;
    if (is_active !== undefined) updateFields.is_active = is_active;

    const db = await getDb();
    const result = await db
      .collection<Node>("nodes")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    console.error("[nodes PUT]", error);
    return NextResponse.json(
      { error: "Failed to update node" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nodes/[id]
 * Delete a single node
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }
    
    const db = await getDb();
    const result = await db
      .collection("nodes")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("[nodes DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete node" },
      { status: 500 }
    );
  }
}
