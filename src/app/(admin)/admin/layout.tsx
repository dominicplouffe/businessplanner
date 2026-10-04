import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Admin",
  // Never indexed, and never summarised into a search result.
  robots: { index: false, follow: false },
};

/* The gate is `requireAdmin()`, which 404s rather than redirecting: there is no
   reason to tell somebody who is not an admin that an admin area exists. It is
   repeated in every action — see the note in admin-actions.ts. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-hairline bg-surface-sunken">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/admin" className="font-display text-lg tracking-[-0.02em]">
              Admin
            </Link>
            <span className="text-sm text-tertiary">signed in as {admin.email}</span>
          </div>
          <Link href="/plans" className="text-sm text-secondary underline-offset-4 hover:underline">
            Back to the app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
