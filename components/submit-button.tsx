"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof buttonClass;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass[variant]}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
