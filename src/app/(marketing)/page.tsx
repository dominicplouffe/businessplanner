import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { Faq } from "@/components/marketing/faq";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section, SectionHeader } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { differentiators, engineFacts, faqItems } from "@/lib/content/home";
import { pricing } from "@/lib/brand";

export default function HomePage() {
  return (
    <>
      {/* ——— Hero ——————————————————————————————————————————————— */}
      <section className="relative overflow-hidden border-b border-hairline">
        {/* Theme-aware wash. A fixed light tint here turns the dark canvas grey. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-sunken to-transparent opacity-70"
        />
        <Container width="wide" className="relative pt-16 pb-20 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">Business planning, done properly</Eyebrow>
            <h1 className="mt-6 text-display-lg sm:text-display-xl lg:text-display-2xl">
              The business plan your lender actually reads.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-secondary sm:text-xl">
              Most AI tools write confident prose over invented numbers. Venturally
              computes every figure from a real financial model, cites every market
              claim, and refuses to export a plan whose words contradict its
              spreadsheet.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan — free
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/examples" variant="secondary" size="lg">
                Read a finished plan
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-tertiary">
              No card to start. Read every page before you pay anything.
            </p>
          </div>

          {/* Product evidence above the CTA, not below it. */}
          <div className="mx-auto mt-14 max-w-5xl">
            <HeroDemo />
          </div>
        </Container>
      </section>

      {/* ——— The engine, in four numbers ————————————————————————— */}
      <Section tone="sunken" className="py-14 sm:py-16">
        <Container width="wide">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
            {engineFacts.map((fact) => (
              <li key={fact.label}>
                <p className="figure-hero font-display text-display-md text-primary">{fact.value}</p>
                <p className="mt-2 text-sm font-medium text-primary">{fact.label}</p>
                <p className="mt-1 text-sm leading-snug text-tertiary">{fact.detail}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ——— Differentiators ————————————————————————————————————— */}
      <Section>
        <SectionHeader
          eyebrow="Why plans get rejected"
          title="Four of the five reasons have nothing to do with the writing."
          lede="The category solved prose years ago, and it turned out not to be the problem. What sinks a plan is arithmetic that does not hold, claims nobody can check, and a narrative that argues with its own spreadsheet."
        />
        <Container className="mt-16">
          <div className="divide-y divide-hairline border-t border-hairline">
            {differentiators.map((item, i) => (
              <article key={item.key} className="grid gap-6 py-12 lg:grid-cols-[auto_1fr_auto] lg:gap-12">
                <div className="lg:w-16">
                  <span className="numeric text-sm text-brass-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="max-w-2xl">
                  <Eyebrow className="mb-4">{item.eyebrow}</Eyebrow>
                  <h3 className="text-display-sm">{item.title}</h3>
                  <p className="mt-4 leading-relaxed text-secondary">{item.body}</p>
                </div>
                <p className="max-w-[16rem] border-l-2 border-brass-500 pl-4 text-sm leading-relaxed text-tertiary lg:pt-10">
                  {item.proof}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      {/* ——— Provenance ————————————————————————————————————————— */}
      <Section tone="inverse">
        <Container width="wide">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <Eyebrow className="mb-5 text-paper-300">Provenance</Eyebrow>
              <h2 className="text-display-md sm:text-display-lg">
                Every number says where it came from.
              </h2>
              <p className="mt-6 leading-relaxed text-paper-200">
                A plan that distinguishes what you told us from what we assumed is
                more credible than one that flattens both into confident prose. So
                every driver is tagged, and the tag is printed in the finished
                document — because the fastest way to lose a reader is to sound
                equally certain about a number you measured and a number you guessed.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  ["Known", "You measured it or you have it in writing."],
                  ["Estimated", "Your judgement, recorded as such."],
                  ["Benchmark", "An industry median, named and dated."],
                ].map(([label, detail]) => (
                  <li key={label} className="flex gap-3">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brass-400" />
                    <span className="text-[0.95rem] text-paper-200">
                      <span className="font-medium text-paper">{label}.</span> {detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-7">
              <p className="text-eyebrow font-medium uppercase text-paper-300">
                Benchmarks warn — they never overwrite
              </p>
              <blockquote className="mt-5 border-l-2 border-brass-500 pl-5">
                <p className="font-display text-xl leading-snug text-paper">
                  “A 42% net margin is roughly five times the median for a full-service
                  restaurant. A lender will challenge this before anything else in the plan.”
                </p>
              </blockquote>
              <p className="mt-5 text-sm leading-relaxed text-paper-300">
                We flag the assumption with its source and let you justify it. Silently
                substituting a median would destroy the specificity that makes your plan
                yours — and specificity is the whole argument.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ——— Who it's for ——————————————————————————————————————— */}
      <Section>
        <SectionHeader
          eyebrow="Built for a specific reader"
          title="A plan is a document with an audience of one."
          lede="What a credit committee needs and what a seed investor needs are different documents. Venturally builds for the reader you name."
        />
        <Container className="mt-14">
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                href: "/solutions/investor-raise",
                eyebrow: "Raising capital",
                title: "Pre-seed and seed rounds",
                body: "Bottom-up market sizing, a cap table with SAFE conversion and pre-money option pools, unit economics, and a deck generated from the same model so the slides and the plan can never disagree.",
              },
              {
                href: "/solutions/immigration",
                eyebrow: "Immigration",
                title: "E-2, L-1A and EB-5",
                body: "Document structures that follow the regulations rather than a template: owner compensation as a named line, household size for marginality, a cost-of-enterprise denominator for proportionality, and dated job-creation schedules.",
              },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-lg border border-hairline bg-surface-raised p-7 transition-colors hover:border-strong"
              >
                <Eyebrow className="mb-4">{card.eyebrow}</Eyebrow>
                <h3 className="font-display text-2xl">{card.title}</h3>
                <p className="mt-3 leading-relaxed text-secondary">{card.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                  Learn more
                  <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      {/* ——— Pricing teaser ————————————————————————————————————— */}
      <Section tone="sunken">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-xl">
              <Eyebrow className="mb-5">Pricing</Eyebrow>
              <h2 className="text-display-md">
                Read the whole plan first. Pay once, when you are ready to send it.
              </h2>
              <p className="mt-5 leading-relaxed text-secondary">
                A consultant-written plan runs {"$"}2,200 to {"$"}3,500, and a specialist
                immigration plan considerably more. A {"$"}9.99 generator produces something
                you would not put in front of a credit committee. We priced for the gap:
                one payment, for a document that holds up.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  `Free to generate and read — no card, no watermark on screen`,
                  `$${pricing.unlock.price} once to unlock export and sharing, permanently`,
                  `$${pricing.live.price}/month, optional, to keep the plan live and tracked`,
                  `${pricing.guaranteeDays}-day guarantee and one-click cancellation`,
                ].map((line) => (
                  <li key={line} className="flex gap-3 text-[0.95rem] text-secondary">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:w-72">
              <div className="rounded-lg border border-hairline bg-surface-raised p-7 text-center">
                <p className="text-eyebrow font-medium uppercase text-tertiary">One finished plan</p>
                <p className="figure-hero mt-3 font-display text-display-lg">${pricing.unlock.price}</p>
                <p className="mt-1 text-sm text-tertiary">once, not per month</p>
                <ButtonLink href="/pricing" size="lg" className="mt-6 w-full">
                  See what&apos;s included
                </ButtonLink>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ——— FAQ ———————————————————————————————————————————————— */}
      <Section>
        <SectionHeader eyebrow="Questions" title="Asked and answered." />
        <Container width="default" className="mt-12">
          <Faq items={faqItems.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
        </Container>
      </Section>

      {/* ——— Closing CTA ———————————————————————————————————————— */}
      <Section tone="inverse" className="py-20 sm:py-24">
        <Container className="text-center">
          <h2 className="mx-auto max-w-2xl text-display-md sm:text-display-lg">
            Start with the numbers. The words are the easy part.
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-relaxed text-paper-200">
            Answer a structured intake, and get a complete plan on a financial model
            that ties — in about the time it takes to read this page twice.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/sign-up" variant="inverse" size="lg">
              Start a plan — free
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink
              href="/product/financials"
              size="lg"
              className="border border-white/25 bg-transparent text-paper hover:bg-white/10"
            >
              See how the model works
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
