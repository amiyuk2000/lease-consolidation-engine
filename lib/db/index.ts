import "server-only";
import { connect, type Db } from "./connect";

export type { Db } from "./connect";

const globalForDb = globalThis as unknown as { db?: Db };

function instance(): Db {
  globalForDb.db ??= connect();
  return globalForDb.db;
}

/**
 * Connects on first use, not on import, so loading a module (for example
 * during `next build`) never opens a database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = instance();
    const value: unknown = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
