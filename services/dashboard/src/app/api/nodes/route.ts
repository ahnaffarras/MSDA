import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import type { Node } from "@/lib/types";

/**
 * GET /api/nodes
 * Returns all nodes, optionally filtered by group_id
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("group_id");

    const db = await getDb();
    const query = groupId ? { group_id: groupId } : {};
    
    const nodes = await db
      .collection<Node>("nodes")
      .find(query)
      .sort({ order: 1 })
      .toArray();

    const transformedNodes = nodes.map(node => ({
      ...node,
      id: node._id.toString(),
      _id: undefined
    }));

    return NextResponse.json(transformedNodes);
  } catch (error) {
    console.error("[nodes GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch nodes" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nodes
 * Create a new node
 * Body: { group_id: string, name: string, ap_ip: string, device_type?: string, description?: string, order?: number, is_active?: boolean }
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { 
      group_id,
      name, 
      ap_ip, 
      device_type = 'AP',
      description,
      order, 
      is_active = true 
    } = body;

    if (!group_id || !name || !ap_ip) {
      return NextResponse.json(
        { error: "group_id, name and ap_ip are required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Get the highest order number if order not provided
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxOrderDoc = await db
        .collection<Node>("nodes")
        .find({ group_id })
        .sort({ order: -1 })
        .limit(1)
        .toArray();
      finalOrder = maxOrderDoc.length > 0 ? (maxOrderDoc[0].order || 0) + 1 : 1;
    }

    const newNode: Omit<Node, "id"> = {
      group_id,
      name,
      ap_ip,
      device_type,
      description,
      order: finalOrder,
      is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.collection("nodes").insertOne(newNode);

    return NextResponse.json(
      { ...newNode, id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("[nodes POST]", error);
    return NextResponse.json(
      { error: "Failed to create node" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nodes
 * Delete multiple nodes
 */
export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const result = await db
      .collection("nodes")
      .deleteMany({ id: { $in: ids } });

    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error("[nodes DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete nodes" },
      { status: 500 }
    );
  }
}
