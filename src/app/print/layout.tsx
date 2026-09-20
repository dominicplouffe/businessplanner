import type { Metadata } from "next";
import "@/styles/print.css";

/* The print surface carries none of the app chrome: no sidebar, no theme
   switch, no dark mode. It is a sheet of paper that happens to be served over
   HTTP, and the PDF pipeline renders it exactly as a browser would print it. */
export const metadata: Metadata = {
  title: "Plan",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
