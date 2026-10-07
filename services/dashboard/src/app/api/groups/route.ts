import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/admin";
import type { Group } from "@/lib/types";

/**
 * GET /api/groups
 * Returns all groups, or specific group if id query param is provided
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    const db = await getDb();
    
    let groups;
    if (id) {
      // Get specific group
      if (ObjectId.isValid(id)) {
        groups = await db
          .collection<Group>("groups")
          .find({ _id: new ObjectId(id) })
          .toArray();
      } else {
        groups = await db
          .collection<Group>("groups")
          .find({ id: id })
          .toArray();
      }
    } else {
      // Get all groups
      groups = await db
        .collection<Group>("groups")
        .find({})
        .sort({ order: 1 })
        .toArray();
    }

    const transformedGroups = groups.map(group => ({
      ...group,
      id: group._id.toString(),
      _id: undefined
    }));

    return NextResponse.json(transformedGroups);
  } catch (error) {
    console.error("[groups GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/groups
 * Create a new group
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { 
      name, 
      description,
      order, 
      is_active = true 
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    let finalOrder = order;
    if (finalOrder === undefined) {
      const maxOrderDoc = await db
        .collection<Group>("groups")
        .find({})
        .sort({ order: -1 })
        .limit(1)
        .toArray();
      finalOrder = maxOrderDoc.length > 0 ? (maxOrderDoc[0].order || 0) + 1 : 1;
    }

    const newGroup: Omit<Group, "id"> = {
      name,
      description,
      order: finalOrder,
      is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.collection("groups").insertOne(newGroup);

    return NextResponse.json(
      { ...newGroup, id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("[groups POST]", error);
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}
