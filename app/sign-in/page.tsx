import { redirect } from "next/navigation";
import { tryDemoAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
import { getContext } from "@/lib/auth/session";

export const metadata = { title: "Sign in · Lease Consolidation Engine" };

export default async function SignInPage() {
  if (await getContext()) redirect("/portfolios");
  return (
    <AuthShell title="Sign in" demoAction={tryDemoAction}>
      <SignInForm />
    </AuthShell>
  );
}
