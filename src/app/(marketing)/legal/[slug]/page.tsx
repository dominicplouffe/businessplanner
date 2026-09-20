import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { brand } from "@/lib/brand";
import { LEGAL_DOCUMENTS, getLegalDocument } from "@/lib/content/legal";

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

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
  const doc = getLegalDocument(slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.lede,
    openGraph: { title: `${doc.title} · ${brand.name}`, description: doc.lede },
    alternates: { canonical: `${brand.url}/legal/${doc.slug}` },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getLegalDocument(slug);
  if (!doc) notFound();

  return (
    <>
      <Section className="pb-10 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Legal</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">{doc.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{doc.lede}</p>
          <p className="mt-6 text-sm text-tertiary">
            Effective{" "}
            <time dateTime={doc.effective}>
              {DATE_FORMAT.format(new Date(`${doc.effective}T00:00:00Z`))}
            </time>
            <span aria-hidden className="mx-2">·</span>
            {brand.legalName}
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {doc.sections.map((section, index) => (
              <section
                key={section.heading}
                className="grid gap-6 py-10 lg:grid-cols-[minmax(0,18rem)_1fr] lg:gap-14"
              >
                <h2 className="flex gap-3 font-display text-xl leading-snug">
                  <span aria-hidden className="numeric mt-1 text-xs text-marker">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.heading}
                </h2>
                <div className="max-w-2xl space-y-4">
                  {section.paragraphs.map((p) => (
                    <p key={p.slice(0, 40)} className="leading-relaxed text-secondary">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <nav aria-label="Legal documents">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {LEGAL_DOCUMENTS.filter((d) => d.slug !== doc.slug).map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/legal/${d.slug}`}
                    className="text-sm text-secondary transition-colors hover:text-primary"
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/security"
                  className="text-sm text-secondary transition-colors hover:text-primary"
                >
                  Security
                </Link>
              </li>
            </ul>
          </nav>
        </Container>
      </Section>
    </>
  );
}
