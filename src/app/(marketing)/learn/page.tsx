import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { articlesByDemand, readingMinutes } from "@/lib/content/learn";
import { GLOSSARY_TERMS } from "@/lib/content/glossary";

const LEDE =
  "Long-form, opinionated and specific. Written by the people building the engine, which is why these say what a reader actually checks rather than restating the question with headings.";

export const metadata: Metadata = {
  title: "Learn",
  description: LEDE,
  openGraph: { title: `Learn · ${brand.name}`, description: LEDE },
  alternates: { canonical: `${brand.url}/learn` },
};

export default function LearnIndexPage() {
  const articles = articlesByDemand();

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Learn</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            How to write the thing, and why each part is there.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/learn/${article.slug}`}
                  className="group grid gap-4 py-8 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-14"
                >
                  <div>
                    <h2 className="flex items-start justify-between gap-3 font-display text-xl leading-snug">
                      {article.title}
                      <ArrowUpRight
                        aria-hidden
                        className="mt-1 size-4 shrink-0 text-tertiary transition-colors group-hover:text-primary lg:hidden"
                      />
                    </h2>
                    <p className="numeric mt-1.5 text-xs text-tertiary">
                      {readingMinutes(article)} min read
                    </p>
                  </div>
                  <p className="max-w-2xl leading-relaxed text-secondary">{article.summary}</p>
                </Link>
              </li>
            ))}

            {/* Methodology is an article in every sense except that it is about
                us rather than about plans, so it belongs in the same list. */}
            <li>
              <Link
                href="/learn/methodology"
                className="group grid gap-4 py-8 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-14"
              >
                <div>
                  <h2 className="font-display text-xl leading-snug">
                    How we compute what we compute
                  </h2>
                  <p className="mt-1.5 text-xs text-tertiary">Methodology</p>
                </div>
                <p className="max-w-2xl leading-relaxed text-secondary">
                  The eight rules the product is built on, the regulatory verification
                  queue printed live from the configuration, and what we do not know.
                </p>
              </Link>
            </li>

            <li>
              <Link
                href="/learn/glossary"
                className="group grid gap-4 py-8 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-14"
              >
                <div>
                  <h2 className="font-display text-xl leading-snug">Glossary</h2>
                  <p className="numeric mt-1.5 text-xs text-tertiary">
                    {GLOSSARY_TERMS.length} terms
                  </p>
                </div>
                <p className="max-w-2xl leading-relaxed text-secondary">
                  Every term a lender, an investor or an adjudicator will use, defined
                  plainly and linked to the calculator that computes it.
                </p>
              </Link>
            </li>
          </ul>
        </Container>
      </Section>

      <Section tone="sunken">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">A note on these</Eyebrow>
            </div>
            <div className="max-w-2xl space-y-4 text-[0.95rem] leading-relaxed text-secondary">
              <p>
                Nothing here is padded to hit a word count, and nothing here is written to
                a keyword. Each article exists because the same question kept coming up
                and the existing answers stopped exactly where it got interesting.
              </p>
              <p>
                Where an article states a number, it is either computed by our engine or
                carries its source. Where we do not know something, the article says so
                rather than filling the gap with a confident sentence.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 border-t border-hairline pt-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Reading about it is the slow way.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The intake asks these questions in order and builds the model as you
                answer. Free to generate and read.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/examples" variant="secondary" size="lg">
                Read a finished plan
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
