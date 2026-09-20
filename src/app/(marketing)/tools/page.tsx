import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { toolsByDemand } from "@/lib/content/tools";

const LEDE =
  "Seven calculators that run the product's own engine in your browser. No email wall, no credit meter, no result held back behind a signup form.";

export const metadata: Metadata = {
  title: "Free calculators",
  description: LEDE,
  openGraph: { title: `Free calculators · ${brand.name}`, description: LEDE },
};

const PROMISES = [
  "Nothing is gated. The answer appears as you type.",
  "Nothing you enter leaves your browser — there is no request to send it in.",
  "Each one is the same code the product uses, so they cannot disagree with it.",
];

export default function ToolsIndexPage() {
  const tools = toolsByDemand();

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Free tools</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            The arithmetic, free and unblocked.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
          <ul className="mt-8 space-y-2.5">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-3 text-[0.95rem] text-secondary">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <ul className="grid gap-3 border-y border-hairline py-12 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <li key={tool.slug}>
                <Link
                  href={`/tools/${tool.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-hairline p-6 transition-colors hover:border-strong"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-lg leading-snug">{tool.label}</span>
                    <ArrowUpRight
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-tertiary transition-colors group-hover:text-primary"
                    />
                  </span>
                  <span className="mt-2.5 text-sm leading-relaxed text-secondary">{tool.lede}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="sunken">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">Why these are free</Eyebrow>
            </div>
            <div className="max-w-2xl space-y-4 text-[0.95rem] leading-relaxed text-secondary">
              <p>
                Because gating them would be a bad trade. A calculator behind an email
                form gets used once and linked to never; one that just works gets
                bookmarked, and the people who bookmark it are the people who eventually
                need a whole plan.
              </p>
              <p>
                They also make a claim we would otherwise have to ask you to take on
                trust. Every number here is produced by the same modules the product
                runs — the amortisation ledger, the metrics, the dated regulatory
                configuration. If a threshold changes, it changes here on the same day.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col gap-8 border-t border-hairline pt-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">
                When one number is not the question.
              </h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                The full model links all of these together — three statements, sixty
                months, and a review that blocks export until the prose and the numbers
                agree.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/industries" variant="secondary" size="lg">
                Browse by industry
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
