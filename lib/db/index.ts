import "server-only";
import { connect, type Db } from "./connect";

export type { Db } from "./connect";

const globalForDb = globalThis as unknown as { db?: Db };
export const db: Db = globalForDb.db ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
