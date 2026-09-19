import type { Metadata } from "next";
import { ArrowRight, Check, Minus } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section, SectionHeader } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { Faq } from "@/components/marketing/faq";
import { brand, pricing } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Generate and read a complete plan free. $${pricing.unlock.price} once to unlock export and sharing. $${pricing.live.price}/month to keep it live.`,
};

const tiers = [
  {
    name: pricing.free.name,
    price: "$0",
    cadence: "to generate and read",
    blurb: pricing.free.blurb,
    cta: "Start a plan",
    href: "/sign-up",
    featured: false,
    features: [
      "Full plan generated across every section",
      "Complete financial model, monthly across five years",
      "Market sizing and competitor analysis with sources",
      "Plan review, with every finding and its remedy",
      "Read every page on screen, unwatermarked",
    ],
  },
  {
    name: pricing.unlock.name,
    price: `$${pricing.unlock.price}`,
    cadence: "once, per finished plan",
    blurb: pricing.unlock.blurb,
    cta: `Unlock a plan — $${pricing.unlock.price}`,
    href: "/sign-up",
    featured: true,
    features: [
      "Everything in Draft",
      "Export to PDF, Word, Excel and PowerPoint",
      "Excel model with live formulas, so a banker can audit it",
      "Shareable link with per-recipient read analytics",
      "Pitch deck generated from the same model",
      "Sources appendix and methodology note",
      "Yours permanently — no expiry, no renewal",
    ],
  },
  {
    name: pricing.live.name,
    price: `$${pricing.live.price}`,
    cadence: "per month, optional",
    blurb: pricing.live.blurb,
    cta: "Keep a plan live",
    href: "/sign-up",
    featured: false,
    features: [
      "Everything in Plan",
      "Track actuals against forecast",
      "Re-forecast as the business changes",
      "Monthly variance summary for your lender",
      "Version history across the life of the plan",
      "Cancel in one click, from your settings page",
    ],
  },
] as const;

const comparison: { feature: string; draft: boolean; plan: boolean; live: boolean }[] = [
  { feature: "Generate a complete plan", draft: true, plan: true, live: true },
  { feature: "Three linked financial statements", draft: true, plan: true, live: true },
  { feature: "Underwriter ratios and debt schedule", draft: true, plan: true, live: true },
  { feature: "Plan review and consistency check", draft: true, plan: true, live: true },
  { feature: "Export to PDF and Word", draft: false, plan: true, live: true },
  { feature: "Excel model with live formulas", draft: false, plan: true, live: true },
  { feature: "Pitch deck export", draft: false, plan: true, live: true },
  { feature: "Share links with read analytics", draft: false, plan: true, live: true },
  { feature: "Actuals tracking and re-forecasting", draft: false, plan: false, live: true },
  { feature: "Monthly lender variance summary", draft: false, plan: false, live: true },
];

const pricingFaq = [
  {
    q: "Why is it one payment rather than a subscription?",
    a: "Because that is how the need actually arrives. People write a business plan for a specific reason — a loan application, an investor meeting, a visa filing — and then they are done. Charging monthly for a one-off job is how this category ends up with angry customers fighting auto-renewals. Pay once, keep it.",
  },
  {
    q: `What exactly does the $${pricing.unlock.price} cover?`,
    a: "One finished plan, permanently: every export format, the shareable link, the pitch deck, and any future edits to that plan. Not a seat, not a month, not a credit balance. If you later write a second plan for a different business, that is a second unlock.",
  },
  {
    q: "Is there a catch to the free tier?",
    a: "No. You generate the whole plan, read every page, see the full financial model and the complete review. Nothing is blurred and there is no watermark on screen. The paywall is at export and sharing, which is the point at which the document is doing work for you.",
  },
  {
    q: "How do refunds work?",
    a: `Thirty days, no interrogation. Email ${brand.email.support} and we process it. We are not going to ask you to document ten unsatisfactory sections — that practice is why people distrust this category.`,
  },
  {
    q: "How do I cancel the monthly plan?",
    a: "One click in your settings. No retention flow, no phone call, no email to support. Your exported documents remain yours after you cancel.",
  },
  {
    q: "Do you offer anything for consultants and advisory firms?",
    a: "Multi-client workspaces with a review-and-approve workflow and co-branded client portals are in development. If you write plans for clients, get in touch and we will talk about what you actually need before we build it.",
  },
];

export default function PricingPage() {
  return (
    <>
      <Section className="pb-10 pt-16 sm:pt-20">
        <Container>
          <div className="max-w-3xl">
            <Eyebrow className="mb-5">Pricing</Eyebrow>
            <h1 className="text-display-md sm:text-display-lg">
              Read the whole plan first. Pay once, when you are ready to send it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">
              A consultant-written plan runs {"$"}2,200 to {"$"}3,500, and a specialist
              immigration plan considerably more. A {"$"}9.99 generator produces something
              you would not put in front of a credit committee. We priced for the gap.
            </p>
          </div>
        </Container>
      </Section>

      <Section className="pt-6 sm:pt-6">
        <Container width="wide">
          <div className="grid gap-6 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "flex flex-col rounded-lg border p-7",
                  tier.featured
                    ? "border-emerald-700 bg-surface-raised ring-1 ring-emerald-700"
                    : "border-hairline bg-surface-raised",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-xl">{tier.name}</h2>
                  {tier.featured ? (
                    <span className="rounded-full bg-emerald-800 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-paper">
                      Most chosen
                    </span>
                  ) : null}
                </div>
                <p className="figure-hero mt-5 font-display text-display-md">{tier.price}</p>
                <p className="mt-1 text-sm text-tertiary">{tier.cadence}</p>
                <p className="mt-4 text-sm leading-relaxed text-secondary">{tier.blurb}</p>

                <ul className="mt-7 flex-1 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm text-secondary">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>

                <ButtonLink
                  href={tier.href}
                  size="lg"
                  variant={tier.featured ? "primary" : "secondary"}
                  className="mt-8 w-full"
                >
                  {tier.cta}
                </ButtonLink>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-tertiary">
            {pricing.guaranteeDays}-day money-back guarantee on any payment, and one-click
            cancellation. We will not ask you to justify it.
          </p>
        </Container>
      </Section>

      {/* Comparison */}
      <Section tone="sunken">
        <SectionHeader eyebrow="Compared" title="What is in each tier." />
        <Container className="mt-12">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <caption className="sr-only">Feature comparison across the three tiers</caption>
              <thead>
                <tr className="border-b border-strong">
                  <th scope="col" className="py-3 pr-4 text-sm font-medium text-primary">Feature</th>
                  {tiers.map((t) => (
                    <th key={t.name} scope="col" className="w-24 py-3 text-center text-sm font-medium text-primary">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.feature} className="border-b border-hairline">
                    <th scope="row" className="py-3.5 pr-4 text-sm font-normal text-secondary">
                      {row.feature}
                    </th>
                    {[row.draft, row.plan, row.live].map((included, i) => (
                      <td key={i} className="py-3.5 text-center">
                        {included ? (
                          <>
                            <Check aria-hidden className="inline size-4 text-emerald-600" />
                            <span className="sr-only">Included</span>
                          </>
                        ) : (
                          <>
                            <Minus aria-hidden className="inline size-4 text-ink-300" />
                            <span className="sr-only">Not included</span>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      <Section>
        <SectionHeader eyebrow="Questions" title="About paying for this." />
        <Container className="mt-12">
          <Faq items={pricingFaq.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
        </Container>
      </Section>

      <Section tone="inverse" className="py-20">
        <Container className="text-center">
          <h2 className="mx-auto max-w-2xl text-display-md">
            Generate it first. Decide afterwards.
          </h2>
          <div className="mt-8">
            <ButtonLink href="/sign-up" variant="inverse" size="lg">
              Start a plan — free
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
