import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

interface NetworkTypeDoc {
  _id?: ObjectId;
  name: string;
  created_at: string;
}

/**
 * GET /api/network-types
 * Returns all unique network types
 */
export async function GET() {
  try {
    const db = await getDb();
    const types = await db
      .collection<NetworkTypeDoc>("network_types")
      .find({})
      .sort({ name: 1 })
      .toArray();

    // Transform _id to id
    const transformedTypes = types.map(type => ({
      id: type._id.toString(),
      name: type.name,
      created_at: type.created_at
    }));

    return NextResponse.json(transformedTypes);
  } catch (error) {
    console.error("[network-types GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch network types" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/network-types
 * Create a new network type
 * Body: { name: string }
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "name is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const db = await getDb();

    // Check if type already exists (case-insensitive)
    const existing = await db
      .collection<NetworkTypeDoc>("network_types")
      .findOne({ name: { $regex: new RegExp(`^${trimmedName}$`, "i") } });

    if (existing) {
      return NextResponse.json(
        { error: "Network type already exists", id: existing._id.toString() },
        { status: 409 }
      );
    }

    const newType: Omit<NetworkTypeDoc, "_id"> = {
      name: trimmedName,
      created_at: new Date().toISOString(),
    };

    const result = await db.collection("network_types").insertOne(newType);

    return NextResponse.json(
      { id: result.insertedId.toString(), name: trimmedName, created_at: newType.created_at },
      { status: 201 }
    );
  } catch (error) {
    console.error("[network-types POST]", error);
    return NextResponse.json(
      { error: "Failed to create network type" },
      { status: 500 }
    );
  }
}
