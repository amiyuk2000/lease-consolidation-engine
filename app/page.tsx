import Link from "next/link";
import { redirect } from "next/navigation";
import { tryDemoAction } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { getContext } from "@/lib/auth/session";

export default async function Home() {
  if (await getContext()) redirect("/portfolios");
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
        <Brand />
        <nav className="flex items-center gap-5">
          <Link href="/sign-in" className="whitespace-nowrap text-sm text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <form action={tryDemoAction} className="hidden sm:block">
            <SubmitButton pendingText="Setting up…">Try the demo</SubmitButton>
          </form>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 pb-16 pt-6">
        <section className="w-full rounded-[2rem] border border-stone-200/80 bg-white px-6 py-14 sm:px-12 md:px-16 md:py-20">
          <p className="text-sm font-medium text-emerald-800">For corporate real estate and workplace leads</p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl leading-[1.05] text-ink md:text-7xl">
            Know which office space you can actually give back.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            Model consolidation across your portfolio, cost every exit honestly, and rank each option against the cost of doing nothing.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <form action={tryDemoAction}>
              <SubmitButton pendingText="Setting up your demo…">Try the demo, no sign-up</SubmitButton>
            </form>
            <Link href="/sign-up" className={buttonClass.link}>
              Create an account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
