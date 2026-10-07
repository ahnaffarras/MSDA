import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin";
import type { Group } from "@/lib/types";

/**
 * PUT /api/groups/[id]
 * Update a group
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
    const { name, description, order, is_active } = body;

    const updateFields: Partial<Omit<Group, "id" | "created_at">> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (order !== undefined) updateFields.order = order;
    if (is_active !== undefined) updateFields.is_active = is_active;

    const db = await getDb();
    const result = await db
      .collection<Group>("groups")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    console.error("[groups PUT]", error);
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/groups/[id]
 * Delete a group and all its nodes
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
    const objectId = new ObjectId(id);

    // Delete the group
    const result = await db
      .collection<Group>("groups")
      .deleteOne({ _id: objectId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Delete all associated nodes
    await db.collection("nodes").deleteMany({ group_id: id });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("[groups DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete group" },
      { status: 500 }
    );
  }
}
