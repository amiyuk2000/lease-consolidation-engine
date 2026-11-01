import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Production uses DATABASE_URL (Postgres on Vercel). Without it, local
 * development uses PGlite, an embedded Postgres stored in ./.pglite, so the
 * app runs with no database account.
 */
export function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (url) return drizzlePostgres(postgres(url, { prepare: false, max: 5 }), { schema });
  if (process.env.VERCEL) {
    // Vercel's filesystem is read-only; an embedded database cannot work there.
    throw new Error("DATABASE_URL is not set. Connect a Postgres database to this Vercel project.");
  }
  return drizzlePglite(process.env.PGLITE_DIR ?? "./.pglite", { schema });
}
