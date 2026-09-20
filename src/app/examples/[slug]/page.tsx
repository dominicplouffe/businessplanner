import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanDocument } from "@/components/print/plan-document";
import { brand } from "@/lib/brand";
import { EXAMPLE_PLANS, buildExample, getExamplePlan } from "@/lib/content/examples";

export function generateStaticParams() {
  return EXAMPLE_PLANS.map((e) => ({ slug: e.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const example = getExamplePlan(slug);
  if (!example) return {};
  return {
    title: `${example.companyName} — sample business plan`,
    description: example.summary,
    openGraph: {
      title: `${example.companyName} — sample business plan · ${brand.name}`,
      description: example.summary,
    },
    alternates: { canonical: `${brand.url}/examples/${example.slug}` },
  };
}

export default async function ExampleDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const example = getExamplePlan(slug);
  if (!example) notFound();

  const { doc, review, industry } = buildExample(example);
  const blocking = review.validation.findings.filter((f) => f.severity === "blocking");

  return (
    <>
      {/* A slim bar rather than the full site chrome: this page is a document,
          and the document is the thing being demonstrated. */}
      <nav
        aria-label="Sample plan"
        className="sticky top-0 z-10 border-b border-ink-950/10 bg-white/90 backdrop-blur-md print:hidden"
      >
        <div className="mx-auto flex max-w-[170mm] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <p className="text-sm text-ink-700">
            <Link href="/examples" className="underline-offset-4 hover:underline">
              Sample plans
            </Link>
            <span aria-hidden className="mx-2 text-ink-550">/</span>
            <span className="text-ink-950">{example.companyName}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <Link href="/" className="text-ink-700 underline-offset-4 hover:underline">
              {brand.name}
            </Link>
            <Link
              href="/sign-up"
              className="rounded-sm bg-emerald-800 px-3 py-1.5 text-paper hover:bg-emerald-700"
            >
              Start your own
            </Link>
          </p>
        </div>
      </nav>

      {/* Stated before the document, because a reader who finds out afterwards
          that the business is invented discounts everything they just read. */}
      <aside
        className="mx-auto max-w-[170mm] px-4 pt-6 print:hidden"
        aria-label="About this sample"
      >
        <div className="rounded-lg border border-ink-950/12 bg-paper-100 p-5 text-sm leading-relaxed text-ink-700">
          <p>
            <strong className="text-ink-950">A sample.</strong> {example.companyName} does not
            exist. Its assumptions come from our{" "}
            <Link
              href={`/industries/${industry.slug}`}
              className="text-ink-950 underline underline-offset-4"
            >
              {industry.label.toLowerCase()} page
            </Link>
            , and everything downstream of them — sixty months of statements, the coverage
            ratios, the market arithmetic, every figure in the prose — was computed during
            this site&rsquo;s build by the engine your own plan would use.
          </p>
          <p className="mt-3">
            The competitive section is empty on purpose. We will not invent a competitor or
            a source, even for a demonstration.{" "}
            {blocking.length > 0 ? (
              <>
                That is why this plan scores{" "}
                <span className="numeric">{review.readiness.score}</span>/100 and the review
                blocks it: {blocking.map((f) => f.title.toLowerCase()).join("; ")}.
              </>
            ) : (
              <>
                This one still scores{" "}
                <span className="numeric">{review.readiness.score}</span>/100, because an
                internal plan is not read for competitive evidence.
              </>
            )}
          </p>
          <p className="mt-3 text-ink-550">
            Written by the deterministic generator that runs when no API key is present.
            With a key, Claude writes the prose against the identical figures.
          </p>
        </div>
      </aside>

      <PlanDocument doc={doc} />

      <footer className="mx-auto max-w-[170mm] px-4 pb-16 print:hidden">
        <div className="border-t border-ink-950/12 pt-8 text-sm text-ink-700">
          <p className="font-medium text-ink-950">Read another</p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {EXAMPLE_PLANS.filter((e) => e.slug !== example.slug).map((e) => (
              <li key={e.slug}>
                <Link href={`/examples/${e.slug}`} className="underline-offset-4 hover:underline">
                  {e.companyName}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/examples" className="underline-offset-4 hover:underline">
                All samples
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </>
  );
}
