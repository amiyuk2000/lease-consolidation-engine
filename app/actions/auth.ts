"use server";

import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { endSession, startSession } from "@/lib/auth/session";
import { findUserByEmail, provisionUser } from "@/lib/data/repo";
import { db } from "@/lib/db";
import { fieldErrors } from "@/lib/schemas/common";
import { signInSchema, signUpSchema } from "@/lib/schemas/auth";

export interface FormState {
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

function textValues(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = textValues(formData, ["name", "email", "password", "organizationName"]);
  const parsed = signUpSchema.safeParse(raw);
  const values = { ...raw, password: "" };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  if (await findUserByEmail(db, parsed.data.email)) {
    return { errors: { email: "An account with this email already exists" }, values };
  }
  const { userId } = await provisionUser(
    db,
    { name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password), isGuest: false },
    parsed.data.organizationName,
  );
  await startSession(userId);
  redirect("/portfolios");
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = textValues(formData, ["email", "password"]);
  const parsed = signInSchema.safeParse(raw);
  const values = { email: raw.email ?? "" };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const user = await findUserByEmail(db, parsed.data.email);
  const valid = user?.passwordHash ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) return { errors: { _form: "Email or password is incorrect" }, values };
  await startSession(user.id);
  redirect("/portfolios");
}

/** One-click guest account with its own private copy of the sample portfolio. */
export async function tryDemoAction(): Promise<void> {
  const { userId, samplePortfolioId } = await provisionUser(
    db,
    { name: "Guest", email: null, passwordHash: null, isGuest: true },
    "Demo workspace",
  );
  await startSession(userId);
  redirect(`/portfolios/${samplePortfolioId}`);
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
