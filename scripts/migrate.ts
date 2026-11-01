/**
 * Applies migrations and refreshes the benchmarks table.
 * Uses DATABASE_URL if set, otherwise the local PGlite database.
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { BENCHMARK_ROWS } from "../lib/db/benchmark-data";
import type { Db } from "../lib/db/connect";
import * as schema from "../lib/db/schema";

const migrationsFolder = "./drizzle";

async function seed(db: Db) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.benchmarks);
    await tx.insert(schema.benchmarks).values([...BENCHMARK_ROWS]);
  });
}

async function migrateRemote(url: string) {
  const client = postgres(url, { prepare: false, max: 1 });
  try {
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    await seed(db as unknown as Db);
  } finally {
    await client.end();
  }
}

async function migrateLocal(dir: string) {
  const client = new PGlite(dir);
  try {
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    await seed(db as unknown as Db);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Runs one local attempt in a child process, so a crashed database releases its file locks. */
function attemptLocal(): { ok: boolean; stderr: string } {
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1] ?? "", ATTEMPT_FLAG], {
    stdio: ["inherit", "inherit", "pipe"],
    env: process.env,
  });
  return { ok: child.status === 0, stderr: child.stderr?.toString() ?? "" };
}

const ATTEMPT_FLAG = "--attempt";

async function main() {
  // Neon on Vercel provides a direct (unpooled) URL; migrations are safest over a direct connection.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const dir = process.env.PGLITE_DIR ?? "./.pglite";
  if (url) {
    await migrateRemote(url);
  } else if (process.argv.includes(ATTEMPT_FLAG)) {
    await migrateLocal(dir);
    return;
  } else {
    const first = attemptLocal();
    if (!first.ok) {
      if (!existsSync(dir)) throw new Error(first.stderr);
      // A local database stopped mid-write can be left unreadable. Keep it, start fresh.
      const moved = `${dir}-damaged-${Date.now()}`;
      renameSync(dir, moved);
      console.warn(`The local database could not be opened, so a fresh one was created. The old one was kept at ${moved}.`);
      const second = attemptLocal();
      if (!second.ok) throw new Error(second.stderr);
    }
  }
  console.log(`Migrated. ${BENCHMARK_ROWS.length} benchmark rows loaded.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
