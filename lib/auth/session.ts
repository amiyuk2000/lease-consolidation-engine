import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { memberships, organizations, sessions, users } from "@/lib/db/schema";

const COOKIE_NAME = "lce_session";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session and sets its cookie. Call only from a server action or route handler. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(COOKIE_NAME);
}

export interface AppContext {
  user: { id: string; name: string; email: string | null; isGuest: boolean };
  organization: { id: string; name: string };
}

/** The signed-in user and their organization, or null. Cached per request. */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      isGuest: users.isGuest,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  return {
    user: { id: row.userId, name: row.name, email: row.email, isGuest: row.isGuest },
    organization: { id: row.organizationId, name: row.organizationName },
  };
});

export async function requireContext(): Promise<AppContext> {
  const context = await getContext();
  if (!context) redirect("/sign-in");
  return context;
}
