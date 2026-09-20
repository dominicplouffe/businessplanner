import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { EXAMPLE_PLANS, buildExample } from "@/lib/content/examples";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";

const LEDE =
  "Four complete plans, readable end to end. Each one was built during this site's build from a real set of assumptions, run through the same engine your plan uses, and written by the same generator.";

export const metadata: Metadata = {
  title: "Sample business plans",
  description: LEDE,
  openGraph: { title: `Sample business plans · ${brand.name}`, description: LEDE },
  alternates: { canonical: `${brand.url}/examples` },
};

const PURPOSE_LABELS: Record<string, string> = {
  "sba-loan": "For a bank or SBA lender",
  investor: "For investors",
  immigration: "For an immigration filing",
  internal: "For internal planning",
};

export default function ExamplesIndexPage() {
  const built = EXAMPLE_PLANS.map((example) => buildExample(example));

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Sample plans</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            Whole plans, not excerpts.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
          <p className="mt-8 max-w-2xl border-l-2 border-brass-500 pl-5 font-display text-xl leading-snug text-primary">
            Three of these four would not export. We are showing you that rather than
            hiding it, because the reason is the product working.
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {built.map(({ example, doc, review }) => {
              const metrics = review.metrics;
              const y3 = doc.model.annual[2] ?? doc.model.annual.at(-1);
              return (
                <li key={example.slug}>
                  <Link
                    href={`/examples/${example.slug}`}
                    className="group grid gap-6 py-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wide text-tertiary">
                        {PURPOSE_LABELS[example.purpose]}
                      </p>
                      <h2 className="mt-2 flex items-start justify-between gap-3 font-display text-2xl leading-snug">
                        {example.companyName}
                        <ArrowUpRight
                          aria-hidden
                          className="mt-1.5 size-4 shrink-0 text-tertiary transition-colors group-hover:text-primary"
                        />
                      </h2>
                      <p className="mt-1 text-sm text-tertiary">{example.location}</p>
                      <p className="mt-4 max-w-md leading-relaxed text-secondary">
                        {example.summary}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 self-start sm:grid-cols-4">
                      <Figure
                        label="Year 3 revenue"
                        value={formatCurrency(y3?.revenue ?? 0, "USD", { compact: true })}
                      />
                      <Figure
                        label="Year 3 net margin"
                        value={formatPercent(
                          metrics.netMarginByYear.find((y) => y.year === 3)?.margin ?? 0,
                        )}
                      />
                      <Figure
                        label={metrics.underwriter.minimumDscr !== null ? "Coverage" : "Break-even"}
                        value={
                          metrics.underwriter.dscrFirstFullYear !== null
                            ? formatMultiple(metrics.underwriter.dscrFirstFullYear)
                            : metrics.breakEven.profitMonth
                              ? `Month ${metrics.breakEven.profitMonth}`
                              : "—"
                        }
                      />
                      <Figure
                        label="Readiness"
                        value={`${review.readiness.score}/100`}
                        note={review.readiness.bandLabel}
                      />
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </Section>

      {/* The absent competitive section, explained where it cannot be missed. */}
      <Section tone="sunken">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">Why three of them are blocked</Eyebrow>
              <h2 className="text-display-sm">We did not invent any competitors.</h2>
            </div>
            <div className="max-w-2xl space-y-4 text-[0.95rem] leading-relaxed text-secondary">
              <p>
                A sample plan is the easiest place in the world to write three plausible
                competitors with three plausible prices. Nobody would check. It would also
                contradict the one guarantee this product is built on, so the competitive
                section of every sample is empty.
              </p>
              <p>
                The consequence is visible above: the review blocks the three plans whose
                reader expects competitive evidence, and they score 59. The fourth is an
                internal plan, where that evidence is not what the reader is testing, so
                it scores 94 and would export. Same document, same engine, different bar —
                which is the point.
              </p>
              <p>
                In a real plan that section is filled from live research, and every row
                carries a link and the date the price was observed. Undated evidence is
                excluded rather than quietly accepted.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14">
            <div>
              <h2 className="text-display-sm">What is real in these</h2>
            </div>
            <div className="max-w-2xl">
              <ul className="space-y-3">
                {[
                  "The financial model. Sixty months, three linked statements, and a balance sheet that ties in every period.",
                  "The prose. Composed by the same deterministic generator that runs whenever no API key is present — it writes real sentences and invents nothing.",
                  "The review. Scored against the rubric for that plan's specific reader, with the findings shown.",
                  "The document itself. Rendered by the same component that renders a plan you share with an investor.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-[0.95rem] leading-relaxed text-secondary">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 flex gap-2.5 text-xs leading-relaxed text-tertiary">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  The businesses are invented, and so are the population figures behind
                  each market build — they are stated as the owner&rsquo;s own assumptions,
                  which is what they would be in a first draft. With a live key the prose
                  is written by Claude instead, against the same figures.
                </span>
              </p>
            </div>
          </div>

          <div className="mt-16 flex flex-col gap-8 border-t border-hairline pt-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Yours will not be invented.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The intake asks about your business and the engine builds the model from
                your answers. Free to generate and read.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/learn/how-to-write-a-business-plan" variant="secondary" size="lg">
                How to write one
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="mt-1">
        <span className="figure-hero block font-display text-xl tracking-[-0.02em]">{value}</span>
        {note ? <span className="mt-0.5 block text-xs text-tertiary">{note}</span> : null}
      </dd>
    </div>
  );
}
