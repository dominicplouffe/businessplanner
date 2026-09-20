import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { ABOUT } from "@/lib/content/company";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT.lede,
  openGraph: { title: `About · ${brand.name}`, description: ABOUT.lede },
  alternates: { canonical: `${brand.url}/about` },
};

export default function AboutPage() {
  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">About</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            One thing, done properly.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{ABOUT.lede}</p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {ABOUT.sections.map((section) => (
              <section
                key={section.heading}
                className="grid gap-6 py-12 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14"
              >
                <h2 className="text-display-sm">{section.heading}</h2>
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
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Read the method before the marketing.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                Every claim on this site is written to be checked. The methodology page is
                where to start.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/learn/methodology" size="lg">
                How we compute it
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/contact" variant="secondary" size="lg">
                Get in touch
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
