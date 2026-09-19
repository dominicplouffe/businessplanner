import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { PRODUCT_PAGES, getProductPage } from "@/lib/content/product";

export function generateStaticParams() {
  return PRODUCT_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getProductPage(slug);
  if (!page) return {};
  return {
    title: page.eyebrow,
    description: page.lede,
    openGraph: { title: `${page.eyebrow} · Venturally`, description: page.lede },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getProductPage(slug);
  if (!page) notFound();

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">{page.eyebrow}</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">{page.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{page.lede}</p>
          <p className="mt-8 max-w-2xl border-l-2 border-brass-500 pl-5 font-display text-xl leading-snug text-primary">
            {page.promise}
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {page.sections.map((s) => (
              <section key={s.heading} className="grid gap-6 py-12 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
                <h2 className="text-display-sm">{s.heading}</h2>
                <div className="max-w-2xl">
                  <p className="leading-relaxed text-secondary">{s.body}</p>
                  {s.points ? (
                    <ul className="mt-5 space-y-2.5">
                      {s.points.map((p) => (
                        <li key={p} className="flex gap-3 text-[0.95rem] text-secondary">
                          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      {/* Stating the limits is part of being credible about the rest. */}
      <Section tone="sunken">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">What this does not do</Eyebrow>
              <p className="text-sm leading-relaxed text-tertiary">
                Any page that lists only strengths is marketing. These are the limits
                we would want to know about.
              </p>
            </div>
            <ul className="max-w-2xl space-y-4">
              {page.limits.map((l) => (
                <li key={l} className="flex gap-3 text-[0.95rem] leading-relaxed text-secondary">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-tertiary" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 border-t border-hairline pt-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Start with the numbers.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                Free to generate and read. Pay once, when you are ready to send it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/pricing" variant="secondary" size="lg">
                See pricing
              </ButtonLink>
            </div>
          </div>

          <nav aria-label="Other product pages" className="mt-14 border-t border-hairline pt-8">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {PRODUCT_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/product/${p.slug}`}
                    className="text-sm text-secondary transition-colors hover:text-primary"
                  >
                    {p.eyebrow}
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
