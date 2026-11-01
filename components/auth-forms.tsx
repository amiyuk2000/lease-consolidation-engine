"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction, type FormState } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";
import { Field, FormError, buttonClass, inputClass } from "./ui";

export function SignInForm() {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.errors?._form} />
      <Field label="Email" name="email" error={state.errors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} className={inputClass} />
      </Field>
      <Field label="Password" name="password" error={state.errors?.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-sm text-stone-600">
        No account?{" "}
        <Link href="/sign-up" className={buttonClass.link}>
          Create one
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.errors?._form} />
      <Field label="Your name" name="name" error={state.errors?.name}>
        <input id="name" name="name" autoComplete="name" required defaultValue={state.values?.name} className={inputClass} />
      </Field>
      <Field label="Organization" name="organizationName" error={state.errors?.organizationName} hint="Your company or team. Its data is private to its members.">
        <input id="organizationName" name="organizationName" required defaultValue={state.values?.organizationName} className={inputClass} />
      </Field>
      <Field label="Email" name="email" error={state.errors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} className={inputClass} />
      </Field>
      <Field label="Password" name="password" error={state.errors?.password} hint="At least 8 characters.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/sign-in" className={buttonClass.link}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
