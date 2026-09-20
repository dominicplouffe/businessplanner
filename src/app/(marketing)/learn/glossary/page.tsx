import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { GLOSSARY_TERMS, termAnchor, termsByCategory } from "@/lib/content/glossary";

const LEDE =
  "The vocabulary a lender, an investor or an adjudicator actually uses — defined the way they use it, with the way each one gets quietly got wrong.";

export const metadata: Metadata = {
  title: "Glossary",
  description: LEDE,
  openGraph: { title: `Glossary · ${brand.name}`, description: LEDE },
  alternates: { canonical: `${brand.url}/learn/glossary` },
};

export default function GlossaryPage() {
  const groups = termsByCategory();

  return (
    <>
      <Section className="pb-10 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">
            <Link href="/learn" className="hover:text-secondary">Learn</Link>
            <span aria-hidden>/</span>
            Glossary
          </Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            The words on the other side of the table.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
          <p className="numeric mt-6 text-sm text-tertiary">
            {GLOSSARY_TERMS.length} terms
          </p>

          <nav aria-label="Glossary sections" className="mt-8">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {groups.map((group) => (
                <li key={group.key}>
                  <a
                    href={`#${group.key}`}
                    className="text-sm text-secondary underline-offset-4 transition-colors hover:text-primary hover:underline"
                  >
                    {group.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {groups.map((group) => (
              <section
                key={group.key}
                id={group.key}
                className="grid gap-8 py-12 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-14"
              >
                <h2 className="text-display-sm lg:sticky lg:top-24 lg:self-start">
                  {group.label}
                </h2>
                <dl className="max-w-2xl divide-y divide-hairline">
                  {group.terms.map((term) => (
                    <div key={term.term} id={termAnchor(term)} className="py-6 first:pt-0 last:pb-0">
                      <dt className="font-display text-lg leading-snug">
                        {term.term}
                        {term.also ? (
                          <span className="ml-2 text-sm text-tertiary">
                            ({term.also.join(", ")})
                          </span>
                        ) : null}
                      </dt>
                      <dd className="mt-2 leading-relaxed text-secondary">{term.definition}</dd>
                      {term.trap ? (
                        <dd className="mt-3 flex gap-2.5 text-[0.95rem] leading-relaxed text-secondary">
                          <AlertTriangle aria-hidden className="mt-1 size-3.5 shrink-0 text-warning" />
                          <span>
                            <span className="font-medium text-primary">How it goes wrong. </span>
                            {term.trap}
                          </span>
                        </dd>
                      ) : null}
                      {term.link ? (
                        <dd className="mt-3">
                          <Link
                            href={term.link.href}
                            className="text-sm text-marker underline-offset-4 hover:underline"
                          >
                            {term.link.label} →
                          </Link>
                        </dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Run them on your own numbers.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                Most of these are computed by a free calculator on this site, in your
                browser, with nothing to sign up for.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/tools" size="lg">
                Open the calculators
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/learn" variant="secondary" size="lg">
                Back to Learn
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
