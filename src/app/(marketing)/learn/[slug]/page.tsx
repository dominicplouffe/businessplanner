import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lightbulb } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import {
  ARTICLES,
  getArticle,
  readingMinutes,
  type ArticleBlock,
} from "@/lib/content/learn";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

/* `methodology` and `glossary` are their own routes under /learn, and a static
   segment wins over a dynamic one — but leaving dynamicParams open would let
   /learn/anything render an empty article shell. */
export const dynamicParams = false;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.summary,
    openGraph: {
      type: "article",
      title: `${article.title} · ${brand.name}`,
      description: article.summary,
      publishedTime: article.updated,
    },
    alternates: { canonical: `${brand.url}/learn/${article.slug}` },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <>
      <Section className="pb-10 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">
            <Link href="/learn" className="hover:text-secondary">Learn</Link>
          </Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">{article.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{article.lede}</p>
          <p className="mt-6 text-sm text-tertiary">
            <span className="numeric">{readingMinutes(article)}</span> min read
            <span aria-hidden className="mx-2">·</span>
            Updated{" "}
            <time dateTime={article.updated}>
              {DATE_FORMAT.format(new Date(`${article.updated}T00:00:00Z`))}
            </time>
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {article.sections.map((section) => (
              <section
                key={section.heading}
                /* The single-column track is explicit. A grid's implicit `auto`
                   track sizes to max-content, so the wide comparison tables
                   inside stretched the column past the viewport on a phone —
                   and because the page clips, the right-hand column became
                   unreachable rather than merely scrollable. */
                className="grid grid-cols-[minmax(0,1fr)] gap-6 py-12 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14"
              >
                <h2 className="text-display-sm">{section.heading}</h2>
                <div className="min-w-0 max-w-2xl space-y-6">
                  {section.blocks.map((block, i) => (
                    <Block key={i} block={block} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">
                Every rule here is enforced by the product.
              </h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The checks this article describes are the checks that run before a plan
                can be exported. Free to generate and read.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/learn" variant="secondary" size="lg">
                More articles
              </ButtonLink>
            </div>
          </div>

          <nav aria-label="Related reading" className="mt-14 border-t border-hairline pt-8">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {article.related.map((rel) => (
                <li key={rel.href}>
                  <Link
                    href={rel.href}
                    className="text-sm text-secondary transition-colors hover:text-primary"
                  >
                    {rel.label}
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

function Block({ block }: { block: ArticleBlock }) {
  switch (block.kind) {
    case "text":
      return <p className="leading-relaxed text-secondary">{block.body}</p>;

    case "list":
      return (
        <div>
          {block.intro ? (
            <p className="leading-relaxed text-secondary">{block.intro}</p>
          ) : null}
          <ul className={block.intro ? "mt-4 space-y-2.5" : "space-y-2.5"}>
            {block.items.map((item) => (
              <li key={item} className="flex gap-3 text-[0.95rem] leading-relaxed text-secondary">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-brass-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      );

    case "steps":
      return (
        <div>
          {block.intro ? (
            <p className="leading-relaxed text-secondary">{block.intro}</p>
          ) : null}
          <dl className={block.intro ? "mt-5 space-y-5" : "space-y-5"}>
            {block.items.map((item) => (
              <div key={item.title}>
                <dt className="font-medium text-primary">{item.title}</dt>
                <dd className="mt-1 text-[0.95rem] leading-relaxed text-secondary">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case "callout":
      return (
        <aside className="flex gap-3.5 rounded-lg border border-hairline bg-surface-sunken p-5">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-marker" />
          <div>
            <p className="font-medium text-primary">{block.title}</p>
            <p className="mt-1.5 text-[0.95rem] leading-relaxed text-secondary">{block.body}</p>
          </div>
        </aside>
      );

    case "table":
      return (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`${block.caption}, scrollable`}
        >
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <caption className="sr-only">{block.caption}</caption>
            <thead>
              <tr className="border-y border-hairline text-left align-bottom">
                {block.columns.map((col) => (
                  <th key={col} scope="col" className="py-2.5 pr-5 font-medium text-tertiary">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {block.rows.map(([left, right]) => (
                <tr key={left}>
                  <th scope="row" className="py-3 pr-5 text-left align-top font-normal text-primary">
                    {left}
                  </th>
                  <td className="py-3 align-top leading-relaxed text-secondary">{right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
