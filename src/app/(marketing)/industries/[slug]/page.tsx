import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, FileCheck, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { IndustryExampleFigures } from "@/components/marketing/industry-example";
import { brand } from "@/lib/brand";
import { INDUSTRY_PAGES, getIndustryPage, industriesBySector } from "@/lib/content/industries";
import { buildIndustryExample } from "@/lib/content/industry-example";
import { formatPercent } from "@/lib/finance/format";

export function generateStaticParams() {
  return INDUSTRY_PAGES.map((p) => ({ slug: p.slug }));
}

/** The route surface is closed: an unknown slug is a 404, not a build. */
export const dynamicParams = false;

const PURPOSE_LABELS: Record<string, string> = {
  "sba-loan": "an SBA or bank loan",
  investor: "an investor raise",
  immigration: "an immigration filing",
  internal: "internal planning",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) return {};
  return {
    title: page.label,
    description: page.lede,
    openGraph: { title: `${page.title} · ${brand.name}`, description: page.lede },
    alternates: { canonical: `${brand.url}/industries/${page.slug}` },
  };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getIndustryPage(slug);
  if (!page) notFound();

  // The engine runs here, at build time. Nothing on this page is transcribed.
  const example = buildIndustryExample(page);
  const siblings = industriesBySector().find((s) => s.key === page.sector)?.pages ?? [];

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">
            <Link href="/industries" className="hover:text-secondary">Industries</Link>
            <span aria-hidden>/</span>
            {page.label}
          </Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">{page.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{page.lede}</p>
          <p className="mt-6 text-sm text-tertiary">
            Written for {PURPOSE_LABELS[page.typicalPurpose] ?? "a general reader"}, which is
            where most plans in this sector go
            {page.naics ? (
              <>
                <span aria-hidden className="mx-2">·</span>
                NAICS {page.naics}
              </>
            ) : null}
          </p>
        </Container>
      </Section>

      {/* Cost structure — the thing a sector page exists to carry. */}
      <Section className="py-0 sm:py-0">
        <Container>
          <div className="grid gap-8 border-y border-hairline py-12 lg:grid-cols-[minmax(0,19rem)_1fr] lg:gap-14">
            <div>
              <h2 className="text-display-sm">Where the money goes</h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                Typical shares of revenue in this sector. Shown as a starting point to
                argue with, never as a target to hit — your own figures replace all of
                these at intake.
              </p>
            </div>
            <dl className="max-w-2xl divide-y divide-hairline border-t border-hairline">
              {/* dt and dd stay direct children of the group div: axe's dlitem
                  rule rejects them one level deeper, which is easy to do by
                  reaching for a flex wrapper. */}
              {page.costStructure.map((line) => (
                <div
                  key={line.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 py-4"
                >
                  <dt className="font-medium">{line.label}</dt>
                  <dd className="numeric shrink-0 text-marker">
                    {formatPercent(line.shareOfRevenue, 0)}
                  </dd>
                  <dd className="mt-1 w-full text-sm leading-relaxed text-secondary">{line.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      {/* The worked model */}
      <Section tone="sunken">
        <Container>
          <div className="max-w-2xl">
            <Eyebrow className="mb-4">A worked model</Eyebrow>
            <h2 className="text-display-sm sm:text-display-md">
              One plausible {page.label.toLowerCase()}, built out in full.
            </h2>
            <p className="mt-5 leading-relaxed text-secondary">
              Not an illustration. These assumptions were run through the same engine the
              product uses, and the plan review was run over the result. It is here so you
              can see the shape of the answer before you start.
            </p>
          </div>
          <div className="mt-12">
            <IndustryExampleFigures example={example} />
          </div>
        </Container>
      </Section>

      {/* Reader questions */}
      <Section className="py-0 sm:py-0">
        <Container>
          <div className="grid gap-8 border-b border-hairline py-16 lg:grid-cols-[minmax(0,19rem)_1fr] lg:gap-14">
            <div>
              <h2 className="text-display-sm">What they will ask first</h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                A plan that answers these before they are asked reads as competent. One
                that does not gets sent back with them attached.
              </p>
            </div>
            <dl className="max-w-2xl space-y-8">
              {page.readerAsks.map((ask) => (
                <div key={ask.question}>
                  <dt className="font-display text-lg leading-snug">{ask.question}</dt>
                  <dd className="mt-2.5 leading-relaxed text-secondary">{ask.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      {/* Risks and regulatory */}
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-display-sm">Where these plans get sent back</h2>
              <ul className="mt-7 space-y-6">
                {page.risks.map((risk) => (
                  <li key={risk.title} className="flex gap-3.5">
                    <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0 text-warning" />
                    <div>
                      <p className="font-medium">{risk.title}</p>
                      <p className="mt-1 text-[0.95rem] leading-relaxed text-secondary">{risk.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-display-sm">Licences and filings to budget for</h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                These belong in the use of funds, not in a footnote. A missing permit line
                is the cheapest possible reason to be sent back.
              </p>
              <ul className="mt-7 space-y-3.5">
                {page.regulatory.map((item) => (
                  <li key={item} className="flex gap-3.5 text-[0.95rem] leading-relaxed text-secondary">
                    <FileCheck aria-hidden className="mt-1 size-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-8 flex gap-2.5 border-t border-hairline pt-6 text-xs leading-relaxed text-tertiary">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Requirements vary by state, county and city, and they change. Treat this
                  as the list to go and verify locally rather than as legal advice — the
                  product tracks the dated ones as configuration with a source and an
                  effective date, and prints which version it assumed.
                </span>
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* CTA and siblings */}
      <Section tone="sunken">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-xl text-display-sm">
                Start from these defaults, then make them yours.
              </h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The intake pre-fills this sector&rsquo;s drivers and tags each one as your
                figure or an industry default — and says which in the finished plan.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a {page.label.toLowerCase()} plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/product/financials" variant="secondary" size="lg">
                How the model works
              </ButtonLink>
            </div>
          </div>

          {siblings.length > 1 ? (
            <nav aria-label="Related industries" className="mt-14 border-t border-hairline pt-8">
              <ul className="flex flex-wrap gap-x-8 gap-y-3">
                {siblings
                  .filter((p) => p.slug !== page.slug)
                  .map((p) => (
                    <li key={p.slug}>
                      <Link
                        href={`/industries/${p.slug}`}
                        className="text-sm text-secondary transition-colors hover:text-primary"
                      >
                        {p.label}
                      </Link>
                    </li>
                  ))}
                <li>
                  <Link
                    href="/industries"
                    className="text-sm text-marker transition-colors hover:text-primary"
                  >
                    All industries
                  </Link>
                </li>
              </ul>
            </nav>
          ) : null}
        </Container>
      </Section>
    </>
  );
}
