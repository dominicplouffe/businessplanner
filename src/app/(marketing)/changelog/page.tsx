import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { brand } from "@/lib/brand";
import { CHANGELOG } from "@/lib/content/company";

const LEDE =
  "What shipped, when, and why. Written for people deciding whether this is a product or a project.";

export const metadata: Metadata = {
  title: "Changelog",
  description: LEDE,
  openGraph: { title: `Changelog · ${brand.name}`, description: LEDE },
  alternates: { canonical: `${brand.url}/changelog` },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default function ChangelogPage() {
  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Changelog</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">What shipped.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {CHANGELOG.map((release) => (
              <article
                key={release.date}
                className="grid gap-6 py-12 lg:grid-cols-[minmax(0,14rem)_1fr] lg:gap-14"
              >
                <div>
                  <p className="numeric text-sm text-marker">
                    <time dateTime={release.date}>
                      {DATE_FORMAT.format(new Date(`${release.date}T00:00:00Z`))}
                    </time>
                  </p>
                  <h2 className="mt-2 font-display text-xl leading-snug">{release.title}</h2>
                </div>
                <ul className="max-w-2xl space-y-3.5">
                  {release.entries.map((entry) => (
                    <li key={entry.slice(0, 40)} className="flex gap-3.5 leading-relaxed text-secondary">
                      <span aria-hidden className="mt-3 h-px w-4 shrink-0 bg-brass-500" />
                      {entry}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
