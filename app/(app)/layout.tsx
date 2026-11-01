import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { SubmitButton } from "@/components/submit-button";
import { requireContext } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, organization } = await requireContext();
  return (
    <div className="min-h-screen bg-canvas">
      {user.isGuest ? (
        <div className="bg-night px-4 py-2.5 text-center text-sm text-stone-200">
          Private demo workspace with invented sample data. Change anything; nobody else can see it.
        </div>
      ) : null}
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-8">
            <Brand />
            <Link href="/portfolios" className="hidden text-sm text-ink-soft hover:text-ink sm:inline">
              Portfolios
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-stone-500">
            <span className="hidden sm:inline">
              {user.isGuest ? "Guest" : user.name} · {organization.name}
            </span>
            <form action={signOutAction}>
              <SubmitButton variant="secondary" pendingText="Signing out…">
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 md:py-14">{children}</main>
    </div>
  );
}
