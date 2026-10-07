/**
 * MongoDB connection singleton for Next.js.
 *
 * MongoClient is created lazily on the first getDb() call so that
 * importing this module at build-time does NOT throw — even without
 * MONGODB_URI in the environment. The error surfaces only when an
 * API route actually tries to query the database at runtime.
 */

import { MongoClient, type Db } from "mongodb";

const MONGO_DB = process.env.MONGODB_DB ?? "sata";

// ── Dev: persist across HMR cycles via global ──────────────────────────────
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function buildClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return Promise.reject(
      new Error(
        "MONGODB_URI is not set. " +
          "Create .env.local (dev) or set the env var in your deployment."
      )
    );
  }
  const promise = new MongoClient(uri).connect();
  // Koneksi yang GAGAL (mis. MongoDB belum siap saat container start) tidak boleh
  // di-cache selamanya: kosongkan agar pemanggilan berikutnya mencoba menyambung lagi.
  // (Tanpa ini satu kegagalan awal merusak semua route API sampai proses di-restart.)
  promise.catch(() => {
    if (global._mongoClientPromise === promise) global._mongoClientPromise = undefined;
    if (_prodPromise === promise) _prodPromise = undefined;
  });
  return promise;
}

function getClientPromise(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = buildClientPromise();
    }
    return global._mongoClientPromise;
  }
  // Production: one promise per module instance (per worker process).
  // Module-level variable is fine here because there are no HMR reloads.
  if (!_prodPromise) _prodPromise = buildClientPromise();
  return _prodPromise;
}

let _prodPromise: Promise<MongoClient> | undefined;

// ── Public API ──────────────────────────────────────────────────────────────

/** Returns a connected MongoClient. Prefer getDb() for most use-cases. */
export async function getMongoClient(): Promise<MongoClient> {
  return getClientPromise();
}

/**
 * Returns the SATA database handle.
 *
 * Usage:
 *   const db = await getDb();
 *   const docs = await db.collection("dns_events").find({}).toArray();
 */
export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(MONGO_DB);
}
