import type { Metadata } from "next";
// The shared plan is the same document as the print route, so it needs the
// same stylesheet. Reading it unstyled is what an investor would otherwise get.
import "@/styles/print.css";

/* A shared plan is read by someone with no account and no context, so it gets
   none of the app chrome — and it is never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="light" className="min-h-dvh bg-surface">{children}</div>;
}
