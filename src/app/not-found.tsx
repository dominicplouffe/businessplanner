import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/* The root not-found renders outside the marketing layout, so it carries its
   own way back rather than relying on a header being there. */
const ELSEWHERE = [
  { label: "The financial model", href: "/product/financials" },
  { label: "Free calculators", href: "/tools" },
  { label: "Plans by industry", href: "/industries" },
  { label: "How we compute it", href: "/learn/methodology" },
  { label: "Pricing", href: "/pricing" },
];

export default function NotFound() {
  return (
    <Section className="flex min-h-dvh items-center">
      <Container>
        <div className="max-w-2xl">
          <Eyebrow className="mb-5">404</Eyebrow>
          <h1 className="text-display-md sm:text-display-lg">
            That page is not here.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-secondary">
            Either it moved or it never existed. Both are our fault rather than yours,
            and if you followed a link from inside this site we would like to know.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/" size="lg">
              Back to the start
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Tell us about it
            </ButtonLink>
          </div>

          <nav aria-label="Elsewhere on this site" className="mt-14 border-t border-hairline pt-8">
            <p className="text-eyebrow font-medium uppercase text-tertiary">Elsewhere</p>
            <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {ELSEWHERE.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-secondary transition-colors hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </Section>
  );
}
