import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { CONFIG_VINTAGE } from "@/lib/content/regulatory";
import { INDUSTRY_BENCHMARKS } from "@/lib/finance/benchmarks";
import { INDUSTRY_PAGES } from "@/lib/content/industries";
import { TOOL_PAGES } from "@/lib/content/tools";

const LEDE =
  "Exactly how the numbers are produced, which of them a language model is allowed anywhere near, and what we do not know. Written to be checked, not to be believed.";

export const metadata: Metadata = {
  title: "Methodology",
  description: LEDE,
  openGraph: { title: `Methodology · ${brand.name}`, description: LEDE },
  alternates: { canonical: `${brand.url}/learn/methodology` },
};

type Rule = { heading: string; body: string[]; points?: string[] };

const RULES: Rule[] = [
  {
    heading: "The AI never writes a number that appears in a financial statement",
    body: [
      "This is the rule the whole product is built around, and it is architectural rather than aspirational. The financial engine is pure TypeScript with no network access and no model in it. It takes assumptions and returns statements.",
      "A language model is allowed to do two things: propose assumptions before the engine runs, and describe what the engine produced after it has run. The prose is written against a facts block assembled from engine output, and a test asserts mechanically that every currency figure appearing in generated prose traces back to a value the engine computed.",
    ],
    points: [
      "Assumptions in, statements out — the same inputs always give the same outputs",
      "No figure in a statement originates from a model",
      "Generated prose is reconciled against the model before export is allowed",
    ],
  },
  {
    heading: "Three statements that tie, in every period",
    body: [
      "The profit and loss, the cash flow and the balance sheet are computed together across sixty months. The balance sheet is asserted to balance in each one, and the assertion is not decorative: a randomised property test runs the engine over generated assumptions and checks that assets equal liabilities plus equity in every month of every run.",
      "That test has caught two real defects that review did not. Rounding inside the amortisation ledger made principal repayments differ from the amount drawn; and a clamp on the debt balance was silently absorbing the resulting inconsistency. Both are gone. The ledger now runs at full precision and rounds only where a figure is displayed, and no balance is clamped to hide a contradiction.",
    ],
  },
  {
    heading: "Flows sum, stocks close",
    body: [
      "The annual view of a flow — revenue, interest, wages — is the sum of the year's months. The annual view of a stock — cash, debt, any balance-sheet line — is the closing month's value.",
      "Summing a stock as though it were a flow overstates it roughly twelvefold and still balances, so nothing downstream catches it. The two cases are separate functions in the code precisely so the choice has to be made deliberately at every row.",
    ],
  },
  {
    heading: "Benchmarks warn; they never overwrite",
    body: [
      "Every benchmark band carries a source, a vintage and a source tier, and an out-of-band assumption is flagged with all three rather than replaced by the median. Substituting an industry median would destroy the specificity that makes a plan credible — the point is to make you justify the difference, not to erase it.",
      "Each band also declares which cost base it is quoted on. A restaurant's gross margin is published on food cost alone; a cleaning contractor's is published after the cleaners' wages, because the wages are the cost of the service. Comparing one against the other is wrong in both directions, and the validator reads whichever figure the band actually means.",
    ],
  },
  {
    heading: "A citation is evidence; a memory is not",
    body: [
      "Market research runs a live web search and keeps only what comes back with a retrievable http source and an ISO date. Anything else is dropped, including when the model returns it confidently — a guarantee that depends on a model following an instruction is not a guarantee.",
      "When research is unavailable the researcher returns nothing at all and says why. It never composes a plausible-looking citation from what it remembers. That asymmetry with the prose generator is deliberate: prose assembled from figures the engine already computed invents nothing, but a source cannot be assembled from nothing, and a fabricated citation in a product whose headline promise is zero uncited claims would be the worst defect in it.",
    ],
  },
  {
    heading: "The narrative is diffed against the model",
    body: [
      "Every figure in the written plan that carries an explicit marker — a currency symbol, a percent sign, a multiplication sign, an employment noun — is extracted and matched against a value the engine computed. Export is blocked until they agree.",
      "Two rules keep it from crying wolf, which would be worse than not checking at all. Tolerance is derived from how precisely the figure was written, so a number rounded to the nearest hundred is matched within fifty. And bare numbers are never checked, because they are years and street numbers far more often than they are claims.",
    ],
  },
  {
    heading: "Provenance travels into the document",
    body: [
      "Every driver captured at intake is tagged as something you told us, something you estimated, or an industry default, and that tag is rendered in the finished plan.",
      "A document that visibly distinguishes the owner's own figure from the sector median is more credible than one that flattens both into confident prose — and it makes the charge of AI filler structurally impossible to level.",
    ],
  },
  {
    heading: "Nothing regulatory is a constant",
    body: [
      "Coverage thresholds, equity injection minimums, loan ceilings, payroll loading, depreciation limits and investment minimums all live in configuration with an effective-date range, a source, a retrieval date and a confidence level. They are read through a function that returns whichever entry is in force on a given date.",
      "This is not hypothetical. SOP 50 10 8.1 takes effect on 2026-10-01 and changes how acquisitions are underwritten; the EB-5 thresholds adjust on 2027-01-01. A product that hardcoded either would ship a wrong answer within a quarter, and would do it silently.",
    ],
  },
];

export default function MethodologyPage() {
  const secondaryTier = INDUSTRY_BENCHMARKS.filter((b) => b.sourceTier === "secondary").length;

  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Methodology</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">
            How we compute what we compute.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{LEDE}</p>
          <p className="mt-8 max-w-2xl border-l-2 border-brass-500 pl-5 font-display text-xl leading-snug text-primary">
            A loan officer should be able to verify our arithmetic rather than decide
            whether to trust it. That is the only reason this page exists.
          </p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <div className="divide-y divide-hairline border-y border-hairline">
            {RULES.map((rule, index) => (
              <section
                key={rule.heading}
                className="grid gap-6 py-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14"
              >
                <div>
                  <p className="numeric text-xs text-marker">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2 className="mt-2 text-display-sm">{rule.heading}</h2>
                </div>
                <div className="max-w-2xl space-y-4">
                  {rule.body.map((p) => (
                    <p key={p.slice(0, 40)} className="leading-relaxed text-secondary">
                      {p}
                    </p>
                  ))}
                  {rule.points ? (
                    <ul className="space-y-2 pt-1">
                      {rule.points.map((point) => (
                        <li key={point} className="flex gap-3 text-[0.95rem] text-secondary">
                          <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-brass-500" />
                          {point}
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

      {/* The verification queue, read from the live configuration. */}
      <Section tone="sunken">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14">
            <div>
              <Eyebrow className="mb-4">What we do not know</Eyebrow>
              <h2 className="text-display-sm">The verification queue</h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary">
                These values are in the product but are not yet confirmed against a
                primary source. Anywhere one is used it is labelled unverified in place,
                and it must not be presented to a lender or an adjudicator as
                authoritative.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-secondary">
                This list is read from the configuration itself, so it cannot go stale
                independently of the product.
              </p>
            </div>
            <div>
              <ol className="divide-y divide-hairline border-y border-hairline">
                {CONFIG_VINTAGE.verificationQueue.map((item, index) => (
                  <li key={item} className="flex gap-4 py-4">
                    <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span className="text-[0.95rem] leading-relaxed text-secondary">
                      <span className="sr-only">Item {index + 1}. </span>
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs leading-relaxed text-tertiary">
                Configuration last reviewed {CONFIG_VINTAGE.lastReviewed}. Of{" "}
                <span className="numeric">{INDUSTRY_BENCHMARKS.length}</span> industry
                benchmark sets, <span className="numeric">{secondaryTier}</span> are
                secondary-tier — usable as ranges, but where a figure has to survive
                scrutiny we substitute RMA Annual Statement Studies or IRS SOI Tax Stats.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14">
            <div>
              <h2 className="text-display-sm">Check it yourself</h2>
              <p className="mt-4 text-sm leading-relaxed text-secondary">
                Nothing above has to be taken on trust. The calculators run the same
                modules the product runs, and the industry pages run whole models through
                the engine at build time.
              </p>
            </div>
            <div className="max-w-2xl space-y-4 text-[0.95rem] leading-relaxed text-secondary">
              <p>
                The{" "}
                <Link href="/tools/dscr" className="text-primary underline underline-offset-4">
                  coverage calculator
                </Link>{" "}
                prints the effective-date range and confidence of every threshold it uses.
                The{" "}
                <Link
                  href="/tools/loan-amortisation"
                  className="text-primary underline underline-offset-4"
                >
                  amortisation schedule
                </Link>{" "}
                is the same ledger the statements are built on. The{" "}
                <Link
                  href="/tools/tam-sam-som"
                  className="text-primary underline underline-offset-4"
                >
                  market sizing tool
                </Link>{" "}
                shows its workings line by line, which is the whole point.
              </p>
              <p>
                Each of the{" "}
                <Link href="/industries" className="text-primary underline underline-offset-4">
                  <span className="numeric">{INDUSTRY_PAGES.length}</span> industry pages
                </Link>{" "}
                carries a complete set of assumptions run through the engine during the
                build, and a test requires each of those models to tie in all sixty
                periods and return zero blocking findings. A page cannot publish an
                example the product itself would reject.
              </p>
              <p>
                All{" "}
                <Link href="/tools" className="text-primary underline underline-offset-4">
                  <span className="numeric">{TOOL_PAGES.length}</span> calculators
                </Link>{" "}
                run in your browser. Nothing you type into them is sent anywhere.
              </p>
            </div>
          </div>

          <div className="mt-16 flex flex-col gap-8 border-t border-hairline pt-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-lg text-display-sm">Put it to work.</h2>
              <p className="mt-3 max-w-md leading-relaxed text-secondary">
                Free to generate and read. Pay once, when you are ready to send it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/product/financials" variant="secondary" size="lg">
                See the financial model
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
