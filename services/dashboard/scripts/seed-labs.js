/**
 * Seed script untuk initial lab data
 * Run dengan: node scripts/seed-labs.js
 */

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://sata:sata123@localhost:27017/sata?authSource=admin";
const MONGO_DB = process.env.MONGODB_DB || "sata";

const ACCESS_POINTS = [
  { ap_ip: "192.168.10.1", ap_name: "Lab Komputer 1" },
  { ap_ip: "192.168.20.1", ap_name: "Lab Komputer 2" },
  { ap_ip: "192.168.30.1", ap_name: "Lab Komputer 3" },
];

async function seedLabs() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db(MONGO_DB);
    const labConfigsCol = db.collection("lab_configs");
    const ipMappingsCol = db.collection("ip_mappings");

    // Check if already seeded
    const existingCount = await labConfigsCol.countDocuments();
    if (existingCount > 0) {
      console.log("⚠ Lab configs already exist. Skipping seed.");
      console.log("  To re-seed, drop collections first:");
      console.log("  mongosh sata --eval 'db.lab_configs.drop(); db.ip_mappings.drop();'");
      return;
    }

    console.log("→ Seeding lab configs...");

    // Insert lab configs
    const labConfigs = ACCESS_POINTS.map((ap, idx) => ({
      name: ap.ap_name,
      ap_ip: ap.ap_ip,
      order: idx + 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const labResults = await labConfigsCol.insertMany(labConfigs);
    console.log(`✓ Created ${labResults.insertedCount} lab configs`);

    // Get lab IDs
    const labs = await labConfigsCol.find({}).toArray();

    console.log("→ Seeding IP mappings...");

    // Create IP mappings for each lab (36 PCs per lab)
    const ipMappings = [];
    for (const lab of labs) {
      const labIndex = ACCESS_POINTS.findIndex((ap) => ap.ap_ip === lab.ap_ip);
      const baseIp = `192.168.${(labIndex + 1) * 10}`;

      for (let i = 0; i < 36; i++) {
        ipMappings.push({
          lab_id: lab._id.toString(),
          client_ip: `${baseIp}.${10 + i}`,
          seat: i + 1,
          label: `PC-${String(i + 1).padStart(2, "0")}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    const ipResults = await ipMappingsCol.insertMany(ipMappings);
    console.log(`✓ Created ${ipResults.insertedCount} IP mappings`);

    console.log("\n🎉 Seed completed successfully!");
    console.log("\nYou can now:");
    console.log("  1. Visit /settings to manage labs");
    console.log("  2. Visit / to see the lab tabs");
    console.log("  3. Use /api/available-ips to see unmapped IPs from logs");
  } catch (error) {
    console.error("✗ Seed failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\n✓ Connection closed");
  }
}

seedLabs();
