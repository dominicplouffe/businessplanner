import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { TOOL_PAGES, getToolPage, type ToolSlug } from "@/lib/content/tools";
import { BreakEvenCalculator } from "@/components/tools/break-even";
import { BurnRunwayCalculator } from "@/components/tools/burn-runway";
import { DscrCalculator } from "@/components/tools/dscr";
import { LoanAmortisationCalculator } from "@/components/tools/loan-amortisation";
import { SbaLoanCalculator } from "@/components/tools/sba-loan";
import { TamSamSomCalculator } from "@/components/tools/tam-sam-som";
import { UnitEconomicsCalculator } from "@/components/tools/unit-economics";

export function generateStaticParams() {
  return TOOL_PAGES.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolPage(slug);
  if (!tool) return {};
  return {
    title: tool.label,
    description: tool.lede,
    openGraph: { title: `${tool.title} · ${brand.name}`, description: tool.lede },
    alternates: { canonical: `${brand.url}/tools/${tool.slug}` },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getToolPage(slug);
  if (!tool) notFound();

  // Prerendered, so this is the build date. The two calculators that read dated
  // regulatory configuration correct it to the real today once they hydrate —
  // a stale threshold is exactly the failure this product exists to prevent.
  const buildDate = new Date().toISOString();

  return (
    <>
      <Section className="pb-10 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">
            <Link href="/tools" className="hover:text-secondary">Free tools</Link>
            <span aria-hidden>/</span>
            {tool.label}
          </Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">{tool.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{tool.lede}</p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="border-y border-hairline py-12">
            {CALCULATORS[tool.slug]({ buildDate })}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="text-display-sm">How this is computed</h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">{tool.audience}</p>
              <ul className="mt-7 space-y-4">
                {tool.method.map((m) => (
                  <li key={m} className="flex gap-3.5 text-[0.95rem] leading-relaxed text-secondary">
                    <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-brass-500" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-display-sm">What it will not tell you</h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                A calculator that lists only what it does is a toy. These are the limits
                worth knowing before you quote the answer to anyone.
              </p>
              <ul className="mt-7 space-y-4">
                {tool.limits.map((l) => (
                  <li key={l} className="flex gap-3 text-[0.95rem] leading-relaxed text-secondary">
                    <Info aria-hidden className="mt-1 size-4 shrink-0 text-tertiary" />
                    {l}
                  </li>
                ))}
              </ul>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-6">
                {tool.related.map((rel) => (
                  <li key={rel.href}>
                    <Link
                      href={rel.href}
                      className="text-sm text-secondary underline-offset-4 transition-colors hover:text-primary hover:underline"
                    >
                      {rel.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="sunken">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-xl text-display-sm">
                This number belongs in a document that agrees with it.
              </h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The full plan links every one of these together and blocks export until
                the prose and the model reconcile. Free to generate and read.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/tools" variant="secondary" size="lg">
                All calculators
              </ButtonLink>
            </div>
          </div>

          <nav aria-label="Other calculators" className="mt-14 border-t border-hairline pt-8">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {TOOL_PAGES.filter((t) => t.slug !== tool.slug).map((t) => (
                <li key={t.slug}>
                  <Link
                    href={`/tools/${t.slug}`}
                    className="text-sm text-secondary transition-colors hover:text-primary"
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </Section>
    </>
  );
}

/** Slug to calculator, as an exhaustive Record over the slug union — adding a
 *  tool to the data without wiring its component is a typecheck failure rather
 *  than a page that renders its own explanation and nothing else. */
const CALCULATORS: Record<ToolSlug, (props: { buildDate: string }) => React.ReactNode> = {
  "loan-amortisation": () => <LoanAmortisationCalculator />,
  "sba-loan": ({ buildDate }) => <SbaLoanCalculator buildDate={buildDate} />,
  "tam-sam-som": () => <TamSamSomCalculator />,
  dscr: ({ buildDate }) => <DscrCalculator buildDate={buildDate} />,
  "unit-economics": () => <UnitEconomicsCalculator />,
  "break-even": () => <BreakEvenCalculator />,
  "burn-runway": () => <BurnRunwayCalculator />,
};
