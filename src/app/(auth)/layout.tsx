import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { brand } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-tertiary">
          <Link href="/legal/terms" className="hover:text-secondary">Terms</Link>
          <span aria-hidden className="mx-2">·</span>
          <Link href="/legal/privacy" className="hover:text-secondary">Privacy</Link>
        </p>
      </div>

      {/* Editorial side. Hidden on small screens rather than shrunk — a
          decorative panel squeezed onto a phone is what makes a site look cheap. */}
      <aside className="relative hidden bg-ink-950 px-12 py-16 text-paper lg:flex lg:flex-col lg:justify-center">
        <blockquote className="max-w-md">
          <p className="border-l-2 border-brass-500 pl-6 font-display text-display-sm leading-snug">
            &ldquo;Founders submit plans. Banks compute ratios.&rdquo;
          </p>
          <footer className="mt-6 pl-6 text-sm leading-relaxed text-paper-200">
            {brand.name} computes them first — debt service coverage, the amortisation
            schedule, the working-capital cycle — so the arithmetic is in the document
            before an underwriter works it out for themselves.
          </footer>
        </blockquote>

        <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-8">
          {[
            ["3", "linked statements"],
            ["60", "monthly periods"],
            ["20", "validation checks"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="sr-only">{label}</dt>
              <dd>
                <span className="figure-hero block font-display text-display-sm">{value}</span>
                <span className="mt-1 block text-sm text-paper-300">{label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
