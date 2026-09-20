import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { industriesBySector, benchmarkFor } from "@/lib/content/industries";
import { formatPercent } from "@/lib/finance/format";

const LEDE =
  "Fifteen sectors, each with the cost structure a reader expects, the questions they open with, and a complete worked model run through the same engine the product uses.";

export const metadata: Metadata = {
  title: "Business plans by industry",
  description: LEDE,
  openGraph: { title: `Business plans by industry · ${brand.name}`, description: LEDE },
};

export default function IndustriesIndexPage() {
  const sectors = industriesBySector();

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Industries</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            What a lender expects to see in your sector.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
          <p className="mt-8 max-w-2xl border-l-2 border-brass-500 pl-5 font-display text-xl leading-snug text-primary">
            Every figure on these pages was computed at build time by the engine — there
            is no separate set of example numbers anywhere on this site.
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {sectors.map((sector) => (
              <section
                key={sector.key}
                className="grid gap-8 py-12 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-14"
              >
                <div>
                  <h2 className="text-display-sm">{sector.heading}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-secondary">{sector.blurb}</p>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {sector.pages.map((page) => {
                    const bm = benchmarkFor(page);
                    return (
                      <li key={page.slug}>
                        <Link
                          href={`/industries/${page.slug}`}
                          className="group flex h-full flex-col rounded-lg border border-hairline p-5 transition-colors hover:border-strong"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="font-display text-lg leading-snug">{page.label}</span>
                            <ArrowUpRight
                              aria-hidden
                              className="mt-1 size-4 shrink-0 text-tertiary transition-colors group-hover:text-primary"
                            />
                          </span>
                          <span className="mt-2 text-sm leading-relaxed text-secondary">
                            {page.costStructure[0]?.label} runs about{" "}
                            <span className="numeric">
                              {formatPercent(page.costStructure[0]?.shareOfRevenue ?? 0, 0)}
                            </span>{" "}
                            of revenue here.
                          </span>
                          <span className="mt-4 text-xs text-tertiary">
                            Net margin band{" "}
                            <span className="numeric">
                              {formatPercent(bm.netMargin.low, 0)}–{formatPercent(bm.netMargin.high, 0)}
                            </span>
                            {page.naics ? (
                              <>
                                <span aria-hidden className="mx-2">·</span>
                                NAICS {page.naics}
                              </>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="sunken">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">How these pages are built</Eyebrow>
            </div>
            <div className="max-w-2xl space-y-4 text-[0.95rem] leading-relaxed text-secondary">
              <p>
                Each page carries a real set of assumptions — drivers, headcount, opex,
                capex, debt — which is run through the financial engine when the site is
                built. The revenue build, the statements, the coverage ratio and the
                benchmark comparison all come from that run.
              </p>
              <p>
                The models are held to the same standard as a customer&rsquo;s plan: the
                balance sheet has to tie in all sixty periods, and the plan review has to
                return zero blocking findings. A test enforces both, so a page cannot
                publish an example the product itself would reject.
              </p>
              <p>
                Benchmark bands are separate from the models and are shown with their
                source and vintage. They warn; they never overwrite an assumption.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 border-t border-hairline pt-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Your sector, your numbers.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The intake starts from your industry&rsquo;s defaults, then asks what makes
                your business different. Free to generate and read.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/tools" variant="secondary" size="lg">
                Try the calculators
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
