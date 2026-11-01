import type { ReactNode } from "react";
import { Brand } from "./brand";
import { SubmitButton } from "./submit-button";

export function AuthShell({ title, children, demoAction }: { title: string; children: ReactNode; demoAction: () => Promise<void> }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-md">
        <Brand />
        <div className="mt-12 rounded-3xl border border-stone-200/80 bg-white p-8">
          <h1 className="mb-6 font-display text-4xl text-ink">{title}</h1>
          {children}
        </div>
        <div className="mt-6 rounded-3xl bg-night p-6 text-center">
          <p className="mb-4 text-sm text-stone-300">Just looking? Open a private demo workspace with sample data.</p>
          <form action={demoAction}>
            <SubmitButton variant="inverse" pendingText="Setting up your demo…">
              Try the demo
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
