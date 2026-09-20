import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { brand } from "@/lib/brand";
import { SECURITY } from "@/lib/content/company";

export const metadata: Metadata = {
  title: "Security",
  description: SECURITY.lede,
  openGraph: { title: `Security · ${brand.name}`, description: SECURITY.lede },
  alternates: { canonical: `${brand.url}/security` },
};

export default function SecurityPage() {
  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Security</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            What is implemented, and what is not.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{SECURITY.lede}</p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {SECURITY.implemented.map((section) => (
              <section
                key={section.heading}
                className="grid gap-6 py-12 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14"
              >
                <h2 className="flex items-start gap-3 text-display-sm">
                  <ShieldCheck aria-hidden className="mt-1.5 size-5 shrink-0 text-emerald-600" />
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

      <Section tone="sunken">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">Not yet</Eyebrow>
              <p className="text-sm leading-relaxed text-secondary">
                Listed because you would find out anyway, and finding out later is worse
                than reading it here.
              </p>
            </div>
            <ul className="max-w-2xl space-y-4">
              {SECURITY.notYet.map((item) => (
                <li key={item} className="flex gap-3 text-[0.95rem] leading-relaxed text-secondary">
                  <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0 text-warning" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 text-sm text-secondary">
            Report a vulnerability to{" "}
            <a
              href={`mailto:${brand.email.support}`}
              className="text-primary underline underline-offset-4"
            >
              {brand.email.support}
            </a>
            . Reports are read the same day.
          </p>
        </Container>
      </Section>
    </>
  );
}
