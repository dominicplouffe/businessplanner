import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { COMPARE_PAGES, SHARED_QUESTIONS, getComparePage } from "@/lib/content/compare";

export function generateStaticParams() {
  return COMPARE_PAGES.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparePage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.lede,
    openGraph: { title: `${page.title} · ${brand.name}`, description: page.lede },
    alternates: { canonical: `${brand.url}/compare/${page.slug}` },
  };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getComparePage(slug);
  if (!page) notFound();

  const questions = [...page.questions, ...SHARED_QUESTIONS];

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">
            <Link href="/compare" className="hover:text-secondary">Comparisons</Link>
          </Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">{page.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{page.lede}</p>

          <div className="mt-10 flex max-w-2xl gap-3.5 rounded-lg border border-hairline bg-surface-sunken p-5">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-tertiary" />
            <div className="text-sm leading-relaxed text-secondary">
              <p>
                <strong className="text-primary">Why there is no table here.</strong>{" "}
                {page.noTableReason}
              </p>
              <p className="mt-3">
                So every statement below is about our product. Everything about the
                alternative is a question — take it to the source.{" "}
                <a
                  href={page.competitorUrl}
                  rel="nofollow noopener"
                  className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                >
                  {page.competitorUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="grid gap-6 border-y border-hairline py-12 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <h2 className="text-display-sm">Why people look at it</h2>
            <p className="max-w-2xl leading-relaxed text-secondary">{page.whyConsidered}</p>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <h2 className="text-display-sm">What to ask</h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary">
                Our answer is stated in full under each one, so you can hold us to it as
                easily as you hold anyone else to theirs.
              </p>
            </div>
            <dl className="max-w-2xl divide-y divide-hairline border-t border-hairline">
              {questions.map((q, index) => (
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
          <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">When not to choose us</Eyebrow>
              <p className="text-sm leading-relaxed text-secondary">
                A comparison page that concludes you should buy from us in every case is
                not a comparison page.
              </p>
            </div>
            <ul className="max-w-2xl space-y-4">
              {page.whenNotUs.map((item) => (
                <li key={item} className="flex gap-3 text-[0.95rem] leading-relaxed text-secondary">
                  <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-brass-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Check the answers, then decide.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                Generation and the full plan are free to read. You pay once, when you are
                ready to send it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/examples" size="lg">
                Read a sample plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/pricing" variant="secondary" size="lg">
                See pricing
              </ButtonLink>
            </div>
          </div>

          <nav aria-label="Other comparisons" className="mt-14 border-t border-hairline pt-8">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {COMPARE_PAGES.filter((p) => p.slug !== page.slug).map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/compare/${p.slug}`}
                    className="text-sm text-secondary transition-colors hover:text-primary"
                  >
                    Compared with {p.competitor}
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
