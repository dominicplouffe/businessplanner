import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { COMPARE_PAGES, SHARED_QUESTIONS } from "@/lib/content/compare";

const LEDE =
  "No feature grids. A list of questions worth asking of any business-plan tool, our own answers in full, and a link so you can go and ask the same questions of the alternative.";

export const metadata: Metadata = {
  title: "Comparisons",
  description: LEDE,
  openGraph: { title: `Comparisons · ${brand.name}`, description: LEDE },
  alternates: { canonical: `${brand.url}/compare` },
};

export default function CompareIndexPage() {
  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Comparisons</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            Eight questions, and the honest answers to them.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
          <p className="mt-8 max-w-2xl border-l-2 border-brass-500 pl-5 font-display text-xl leading-snug text-primary">
            We will not restate somebody else&rsquo;s prices or features from second-hand
            sources. A product that sells you on dated evidence should not publish
            undated claims about anyone, least of all a competitor.
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <ul className="grid gap-3 border-y border-hairline py-12 sm:grid-cols-3">
            {COMPARE_PAGES.map((page) => (
              <li key={page.slug}>
                <Link
                  href={`/compare/${page.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-hairline p-6 transition-colors hover:border-strong"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-lg leading-snug">
                      Compared with {page.competitor}
                    </span>
                    <ArrowUpRight
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-tertiary transition-colors group-hover:text-primary"
                    />
                  </span>
                  <span className="mt-2.5 text-sm leading-relaxed text-secondary">
                    {page.whyConsidered}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <h2 className="text-display-sm">The questions</h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary">
                These decide it, whichever tool you end up with. Take them to whoever
                you are evaluating, including us.
              </p>
            </div>
            <dl className="max-w-2xl divide-y divide-hairline border-t border-hairline">
              {SHARED_QUESTIONS.map((q, index) => (
                <div key={q.question} className="py-7">
                  <dt className="font-display text-lg leading-snug">
                    <span aria-hidden className="numeric mr-2.5 text-xs text-marker">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {q.question}
                  </dt>
                  <dd className="mt-2.5 text-[0.95rem] leading-relaxed text-tertiary">{q.why}</dd>
                  <dd className="mt-3 border-l-2 border-emerald-700 pl-4 text-[0.95rem] leading-relaxed text-secondary">
                    <span className="font-medium text-primary">Our answer. </span>
                    {q.ourAnswer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <Section tone="sunken">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Or check the answers yourself.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                Four complete sample plans, seven calculators running the real engine, and
                a methodology page that prints what we have not yet verified.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/examples" size="lg">
                Read a sample plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/learn/methodology" variant="secondary" size="lg">
                How we compute it
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
