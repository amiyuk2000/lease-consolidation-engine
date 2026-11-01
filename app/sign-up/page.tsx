import { redirect } from "next/navigation";
import { tryDemoAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/auth-forms";
import { getContext } from "@/lib/auth/session";

export const metadata = { title: "Create account · Lease Consolidation Engine" };

export default async function SignUpPage() {
  if (await getContext()) redirect("/portfolios");
  return (
    <AuthShell title="Create an account" demoAction={tryDemoAction}>
      <SignUpForm />
    </AuthShell>
  );
}
