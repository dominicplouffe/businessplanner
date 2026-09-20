/* ==========================================================================
   The Learn hub.
   --------------------------------------------------------------------------
   Long-form, and a long game: these terms are the biggest in the category and
   the hardest to rank for, and the only thing that eventually works on them is
   being more useful than the thing at the top.

   So each article is written to be the version somebody finishes and acts on,
   not the version that repeats the question back with a heading structure. The
   rule for every one of them: say the thing the other results will not. What a
   reader actually checks, where plans actually fail, what a number has to be
   able to survive.

   `demand` records why the article exists. It is not rendered.
   ========================================================================== */

export type ArticleBlock =
  | { kind: "text"; body: string }
  | { kind: "list"; intro?: string; items: string[] }
  | { kind: "steps"; intro?: string; items: { title: string; body: string }[] }
  | { kind: "callout"; title: string; body: string }
  | { kind: "table"; caption: string; columns: [string, string]; rows: [string, string][] };

export type ArticleSection = {
  heading: string;
  blocks: ArticleBlock[];
};

export type Article = {
  slug: string;
  title: string;
  /** Shown in the hub and used as the meta description. */
  summary: string;
  /** The search this exists to answer, verbatim. */
  query: string;
  demand: { volume: number; difficulty: number };
  /** Rough minutes, computed from the body at build time rather than guessed. */
  updated: string;
  lede: string;
  sections: ArticleSection[];
  /** Where to go next, inside the site. */
  related: { label: string; href: string }[];
};

const UPDATED = "2026-09-20";

export const ARTICLES: Article[] = [
  {
    slug: "how-to-write-a-business-plan",
    title: "How to write a business plan",
    summary:
      "The order to write it in, the section that decides whether the rest is read, and the six places plans actually fall over.",
    query: "how to write a business plan",
    demand: { volume: 90_500, difficulty: 57 },
    updated: UPDATED,
    lede:
      "Most guides give you a table of contents. A table of contents is not the hard part — the hard part is that a business plan is a document with an audience of one, and almost nobody writes it that way.",
    sections: [
      {
        heading: "Decide who is reading it before you write a word",
        blocks: [
          {
            kind: "text",
            body: "A credit committee, a seed investor and a visa adjudicator want three different documents. They share a structure and share almost nothing else. The credit committee is testing whether the debt can be serviced in the worst year you are willing to admit to. The investor is testing whether this can be twenty times bigger. The adjudicator is testing whether the document is responsive to a specific set of regulatory requirements and whether it reads as credible.",
          },
          {
            kind: "text",
            body: "Write for one of them. A plan that tries to satisfy all three reads as generic to each, and generic is the specific failure mode that gets a plan skimmed rather than read.",
          },
          {
            kind: "table",
            caption: "What each reader opens with",
            columns: ["Reader", "The first thing they check"],
            rows: [
              ["Bank or SBA lender", "Whether cash flow covers debt service with room to spare, and whether the owner is paid"],
              ["Seed investor", "Whether the market claim is derived or asserted, and whether the unit economics survive one question"],
              ["Immigration adjudicator", "Whether the document is responsive to the regulation and whether it reads like a template"],
              ["You, internally", "Whether the plan changes any decision you were about to make anyway"],
            ],
          },
        ],
      },
      {
        heading: "Write it in the wrong order on purpose",
        blocks: [
          {
            kind: "text",
            body: "The executive summary goes first in the document and last in the writing. It is the only section most readers finish, and it can only be written once you know what the model says — which you will not know until the model exists.",
          },
          {
            kind: "steps",
            intro: "The order that works:",
            items: [
              {
                title: "1. The operating model",
                body: "How you actually make money, as drivers rather than a growth rate. Covers per day, conversion, average ticket. Seats, price, churn. Billable hours, utilisation, rate. If you cannot describe revenue as a small number of things that multiply together, you do not yet have a plan — you have an ambition.",
              },
              {
                title: "2. The numbers",
                body: "Three statements, monthly for at least the first year, that move together. Not a revenue line with a percentage growth rate: a model where changing the price changes the margin, the tax, the cash and the coverage ratio in the same pass.",
              },
              {
                title: "3. The market and the competition",
                body: "Built from the bottom up, sourced, and cross-checked against what your own model says you will sell. Do this after the model and the two will be reconcilable. Do it before and you will be tempted to work backwards from a number you liked.",
              },
              {
                title: "4. Operations, team, risks, regulation",
                body: "The sections that turn a forecast into a business. The staffing plan has to be the same headcount the payroll carries. The risk section has to name risks that would actually change the outcome, not a list of generic ones.",
              },
              {
                title: "5. The executive summary",
                body: "Now, and only now. One page. The business, the ask, the use of funds, the three numbers that matter, and what happens if you are wrong.",
              },
            ],
          },
        ],
      },
      {
        heading: "The six places plans actually fall over",
        blocks: [
          {
            kind: "steps",
            items: [
              {
                title: "Owner compensation shown as zero",
                body: "The most common silent failure in the category. A lender substitutes a market salary and recomputes; the plan that looked serviceable no longer is. For an immigration filing it is worse, because the whole marginality test turns on whether the business supports the applicant. Put a real number in, even if you do not intend to draw it in year one, and say so.",
              },
              {
                title: "Prose that contradicts the spreadsheet",
                body: "The text says forty per cent growth; the model says twelve. The text says eight employees; the payroll carries five. Nobody does this deliberately — it happens because the prose was written once and the model was revised four times. It is also trivially findable, which is why it costs so much credibility when a reader finds it.",
              },
              {
                title: "A market section with no arithmetic",
                body: "Taking a published industry total and claiming one per cent of it is the single most recognisable pattern in an unfundable plan. Count the buyers you can actually reach, multiply by what they spend, and show the working.",
              },
              {
                title: "A downside that only cuts revenue",
                body: "Holding the hiring plan and the marketing budget constant while revenue falls thirty per cent is arithmetic, not a scenario. A real downside moves demand, pricing, timing and spend together, and leaves genuinely committed costs like the lease fixed.",
              },
              {
                title: "Annual-only figures in year one",
                body: "A yearly total hides the month you run out of cash. A reader who has seen a few of these will ask for the monthly detail, and asking is the point at which they stop believing the annual number.",
              },
              {
                title: "No statistic with a date on it",
                body: "An uncited market claim is the most commonly cited reason plans are rejected, and AI-written plans are now notorious for citing reports that do not exist. Every number you did not compute yourself needs a source, a publisher and the date you read it.",
              },
            ],
          },
        ],
      },
      {
        heading: "How long it should be",
        blocks: [
          {
            kind: "text",
            body: "Long enough to answer the questions your reader will ask and no longer. In practice: fifteen to twenty-five pages of narrative for a lender or an investor, plus the financial statements as an appendix. An immigration filing runs longer because the regulation asks for more.",
          },
          {
            kind: "text",
            body: "A useful test: delete any paragraph that contains no number, no name, no date and no place. If the section survives that with nothing left, it was never saying anything.",
          },
        ],
      },
      {
        heading: "Before you send it",
        blocks: [
          {
            kind: "list",
            intro: "Read it as the person receiving it. Then check, specifically:",
            items: [
              "Every figure in the prose appears somewhere in the statements, with the same value",
              "The headcount in the narrative equals the headcount on the payroll equals the org chart",
              "Owner compensation is a visible, non-zero line in every year",
              "Every statistic you did not compute carries a source and a date",
              "Year one is monthly, and no month has cash going negative without a financing line to cover it",
              "The downside case moves at least five drivers, and you can say why each one moves",
              "The break-even date on paper and the break-even date in cash are both stated, and they are different",
            ],
          },
          {
            kind: "callout",
            title: "The thing nobody tells you",
            body: "You will be asked one question you did not prepare for, and your answer to it decides more than the document did. A driver-built model is what lets you answer it in the room — you can change the assumption out loud and say what happens. A plan written as prose around a fixed revenue line cannot do that, and the silence is what the reader remembers.",
          },
        ],
      },
    ],
    related: [
      { label: "Executive summaries that get read", href: "/learn/executive-summary" },
      { label: "Financial projections that survive scrutiny", href: "/learn/financial-projections" },
      { label: "Complete sample plans", href: "/examples" },
    ],
  },

  {
    slug: "business-plan-template",
    title: "Business plan templates, and when to stop using one",
    summary:
      "What a template genuinely helps with, what it quietly costs you, and the section structure worth keeping.",
    query: "business plan template",
    demand: { volume: 673_000, difficulty: 65 },
    updated: UPDATED,
    lede:
      "A template solves the blank page, which is a real problem. It also produces a document that reads like a filled-in form, which is a different real problem — and in some settings it is the one that gets you declined.",
    sections: [
      {
        heading: "What a template is good for",
        blocks: [
          {
            kind: "text",
            body: "Structure. The section list in a business plan is genuinely conventional, and inventing your own ordering helps nobody — a reader who has seen two hundred of these navigates by habit, and a document that puts the market analysis where the operations section should be costs them effort for no gain.",
          },
          {
            kind: "text",
            body: "Coverage, too. A template is a checklist of the things you forgot: the regulatory section, the risk section, the use of funds. Those omissions are common and cheap to fix, and a template fixes them for free.",
          },
        ],
      },
      {
        heading: "What it costs you",
        blocks: [
          {
            kind: "list",
            intro: "Three things, in rising order of seriousness:",
            items: [
              "Prompted prose. A heading that says “Describe your competitive advantage” produces a paragraph describing a competitive advantage, whether or not you have one.",
              "Placeholder numbers. Templates ship with example figures, and example figures have a way of surviving into the version that gets sent.",
              "Recognisability. Where credibility is itself a requirement — immigration filings most obviously — a document a reader has seen the shape of before is a problem the content cannot fully rescue.",
            ],
          },
          {
            kind: "callout",
            title: "The tell",
            body: "Open any template-written plan and look at the financial section. If the revenue line grows by a round percentage each year and no other line responds to it, the numbers were typed rather than computed — and every claim resting on them is now unsupported.",
          },
        ],
      },
      {
        heading: "The section structure worth keeping",
        blocks: [
          {
            kind: "steps",
            intro: "Thirteen sections cover essentially every plan. Three of them are usually missing.",
            items: [
              { title: "Executive summary", body: "One page. Written last. The only section some readers finish." },
              { title: "Company description", body: "What it is, where, who owns it, what stage it is at." },
              { title: "Products and services", body: "What you sell and what it costs you to deliver one of them." },
              { title: "Market analysis", body: "Built bottom-up, with the arithmetic visible and the sources dated." },
              { title: "Competitive landscape", body: "At least three named competitors with links and dated evidence, not adjectives." },
              { title: "Marketing and sales", body: "How a stranger becomes a customer, and what that costs." },
              { title: "Operations", body: "How the thing actually gets made or delivered, including capacity limits." },
              { title: "Team and management", body: "Who does what, and the headcount that matches the payroll exactly." },
              { title: "Applicable regulations", body: "Frequently missing. Licences, inspections and filings belong in the use of funds, not a footnote." },
              { title: "Risks and mitigations", body: "Risks that would change the outcome. A generic list reads as box-ticking." },
              { title: "Resilience to automation", body: "New, and increasingly asked for on longer-term lending. What of this is automatable, and what is not." },
              { title: "Financial plan", body: "Three linked statements, monthly for year one, with the assumptions stated." },
              { title: "Suggested next steps", body: "What happens in the ninety days after the money arrives." },
            ],
          },
        ],
      },
      {
        heading: "When to stop using one",
        blocks: [
          {
            kind: "text",
            body: "The moment the template starts telling you what your business is rather than the other way round. In practice that is when you find yourself writing a section because it is there, or keeping a number because it came with the file.",
          },
          {
            kind: "text",
            body: "The structure is worth keeping forever. The prose and the numbers have to be derived from your business, every time, or the document is describing a generic company that happens to share your name.",
          },
        ],
      },
    ],
    related: [
      { label: "How to write a business plan", href: "/learn/how-to-write-a-business-plan" },
      { label: "Sample plans, end to end", href: "/examples" },
      { label: "Cost structures by industry", href: "/industries" },
    ],
  },

  {
    slug: "executive-summary",
    title: "Executive summaries that actually get read",
    summary:
      "What belongs on the one page, in what order, and the five numbers it has to carry.",
    query: "executive summary example",
    demand: { volume: 6_600, difficulty: 51 },
    updated: UPDATED,
    lede:
      "It is the first section in the document and the last one you should write, because it is a summary of conclusions and you do not have conclusions until the model is built.",
    sections: [
      {
        heading: "One page, in this order",
        blocks: [
          {
            kind: "steps",
            items: [
              { title: "What the business is", body: "Two sentences. What you sell, to whom, where. No adjectives that could belong to another company." },
              { title: "Why now", body: "One or two sentences on what has changed. A business that could have been started identically five years ago invites the question of why it was not." },
              { title: "The ask", body: "The exact amount, the instrument, and what it buys. “$250,000 of SBA 7(a) financing against a $340,000 project” beats “seeking investment”." },
              { title: "The numbers", body: "Five of them, below. Stated flatly, with no hedging language around them." },
              { title: "The evidence", body: "The one or two facts that make this credible: signed contracts, a prior exit, a waiting list, an existing book of business." },
              { title: "What happens if you are wrong", body: "One sentence on the downside and how it is absorbed. Including it signals you have modelled it; omitting it signals you have not." },
            ],
          },
        ],
      },
      {
        heading: "The five numbers",
        blocks: [
          {
            kind: "table",
            caption: "What each number has to survive",
            columns: ["Number", "The question behind it"],
            rows: [
              ["Revenue in year one and year three", "Is this derived from drivers, or is it a growth rate applied to a guess?"],
              ["The month you reach operating profit", "Does the cash last that long, and is that the same month?"],
              ["Gross margin", "Is it inside the band for this industry, and if not, why not?"],
              ["Coverage or runway", "For debt: can it be serviced in the worst year. For equity: how long before you need more."],
              ["Owner compensation", "Is the owner paid? A zero here is read as a mistake or as a fiction."],
            ],
          },
          {
            kind: "text",
            body: "Every one of those has to match the statements exactly. A summary figure that differs from the financial section by even a rounding step is the cheapest possible way to lose a reader, because it is the first thing they can check and the first thing they do check.",
          },
        ],
      },
      {
        heading: "What to leave out",
        blocks: [
          {
            kind: "list",
            items: [
              "The mission statement. Nobody has ever funded one.",
              "The market size, unless it is derived and you can show the derivation in the section that follows.",
              "Adjectives doing the work of evidence: innovative, disruptive, best-in-class, world-class.",
              "Anything you would not be able to defend if the reader stopped you mid-sentence.",
            ],
          },
          {
            kind: "callout",
            title: "A test that works",
            body: "Hand the page to somebody who does not know the business and ask them what you sell, to whom, how much money you want, and what it buys. If they can answer all four, it is done. If they hesitate on any of them, that is the sentence to rewrite.",
          },
        ],
      },
    ],
    related: [
      { label: "How to write a business plan", href: "/learn/how-to-write-a-business-plan" },
      { label: "Financial projections", href: "/learn/financial-projections" },
      { label: "Read a finished summary in context", href: "/examples" },
    ],
  },

  {
    slug: "financial-projections",
    title: "Financial projections that survive scrutiny",
    summary:
      "Driver builds rather than growth rates, three statements that tie, and the ratios a reader computes whether or not you provide them.",
    query: "financial projections for business plan",
    demand: { volume: 2_900, difficulty: 45 },
    updated: UPDATED,
    lede:
      "Nobody believes your projections, and they are not supposed to. What a reader is testing is whether the projections are constructed in a way that can be interrogated — because a model you can argue with is evidence of a business you have thought about.",
    sections: [
      {
        heading: "Build revenue from drivers, not from a growth rate",
        blocks: [
          {
            kind: "text",
            body: "A growth rate is unfalsifiable. Twenty per cent a year cannot be argued with, because there is nothing underneath it to argue about. A driver build can be argued with in both directions, which is exactly why it is worth more.",
          },
          {
            kind: "table",
            caption: "The same revenue, two ways",
            columns: ["Asserted", "Built"],
            rows: [
              ["$1.2m in year one, growing 20% a year", "210 covers a day × 62% seated × $38 average × 26 days"],
              ["Nothing to challenge", "Four numbers, each of which a reader can test against their own experience"],
              ["Every downstream figure inherits the guess", "Change the ticket and margin, tax, cash and coverage all move"],
            ],
          },
          {
            kind: "text",
            body: "The build differs by business model — seats and churn for a subscription, billable hours and utilisation for a service firm, traffic and conversion for a shop — but the principle does not. Revenue should be a small number of things that multiply together, each of which you could defend for thirty seconds.",
          },
        ],
      },
      {
        heading: "Three statements, and why the third one matters",
        blocks: [
          {
            kind: "text",
            body: "A profit and loss on its own tells you whether the business makes money on paper. The cash flow tells you whether it survives. The balance sheet is the one most plans omit, and it is the one that proves the other two are internally consistent: if assets do not equal liabilities plus equity in every period, something in the model is wrong and you do not yet know what.",
          },
          {
            kind: "list",
            intro: "Three things that only show up when the statements are linked:",
            items: [
              "The gap between profitable and funded. Carrying receivables means the cash date is later than the profit date, sometimes by months.",
              "The working-capital cost of growth. Growing fast while paying suppliers in thirty days and collecting in sixty consumes cash exactly when it looks like things are going well.",
              "The real effect of a loan. Interest is on the profit and loss, principal is not — the repayment shows up in cash and nowhere else.",
            ],
          },
        ],
      },
      {
        heading: "Monthly for year one, without exception",
        blocks: [
          {
            kind: "text",
            body: "Annual figures hide the month you run out of money. A business that ends year one with cash in the bank can still have been six weeks from failure in month four, and the annual view shows none of it. Any reader who has seen a few plans will ask for the monthly detail; providing it up front is a small effort that removes an entire round of questions.",
          },
        ],
      },
      {
        heading: "The ratios a reader computes anyway",
        blocks: [
          {
            kind: "text",
            body: "Founders submit plans; banks compute ratios. If the ratio is not in the document the reader works it out, and works it out with assumptions you did not get to choose. Putting it in the plan is how you keep control of the framing.",
          },
          {
            kind: "table",
            caption: "What they compute, and what it has to clear",
            columns: ["Ratio", "What it tests"],
            rows: [
              ["Debt service coverage", "Whether cash available covers scheduled debt service, with a margin the programme sets"],
              ["Current ratio", "Whether short-term assets cover short-term obligations"],
              ["Debt to equity", "How much of the risk you are carrying yourself"],
              ["Owner compensation", "Whether the business supports the person running it"],
              ["Break-even, on profit and on cash", "Two different dates, and both get asked about"],
            ],
          },
        ],
      },
      {
        heading: "Where projections quietly go wrong",
        blocks: [
          {
            kind: "list",
            items: [
              "A cost line that never changes for five years. Rent escalates, insurance rises, maintenance climbs after the warranty ends.",
              "Headcount that grows with revenue but never with a start month, so the payroll cost lands a year before the hire would.",
              "A margin outside the band for the industry with no explanation. It may well be defensible — but unexplained, it reads as an error.",
              "Tax as a flat percentage of a positive number, ignoring the losses carried forward from the first two years.",
              "Rounding inside the model rather than at the edges, which is how a schedule ends up repaying a different amount than was borrowed.",
            ],
          },
          {
            kind: "callout",
            title: "The one test worth running",
            body: "Change your single most uncertain assumption by a third and look at what moves. If the answer barely changes, you have modelled the wrong thing. If it changes catastrophically, that assumption is the plan, and it belongs in the executive summary rather than buried in an appendix.",
          },
        ],
      },
    ],
    related: [
      { label: "Debt service coverage calculator", href: "/tools/dscr" },
      { label: "Break-even calculator", href: "/tools/break-even" },
      { label: "How we compute it", href: "/learn/methodology" },
    ],
  },

  {
    slug: "swot-analysis",
    title: "SWOT analysis, done in a way that changes something",
    summary:
      "The four boxes are easy and useless on their own. What makes them worth the page is what you do after filling them in.",
    query: "swot analysis template",
    demand: { volume: 12_100, difficulty: 61 },
    updated: UPDATED,
    lede:
      "Almost every SWOT in almost every business plan is four lists of adjectives that could have been written about any company in the sector. The framework is not the problem. Stopping at the framework is.",
    sections: [
      {
        heading: "The four boxes, stated properly",
        blocks: [
          {
            kind: "table",
            caption: "Internal and external, present and potential",
            columns: ["Box", "The discipline"],
            rows: [
              ["Strengths", "Internal, present, and specific to you. If a competitor could write the same sentence, it is not a strength."],
              ["Weaknesses", "Internal, present, and things you would rather not write down. A weakness list with nothing uncomfortable on it is decorative."],
              ["Opportunities", "External and not yet acted on. An opportunity you are already pursuing is a strategy, and belongs in the plan as one."],
              ["Threats", "External and outside your control. A threat you can eliminate by choosing differently is a decision, not a threat."],
            ],
          },
          {
            kind: "text",
            body: "The most common error is putting an internal choice in the external column. “Rising competition” is a threat. “We have not hired a salesperson” is a weakness, and calling it a threat quietly moves the responsibility somewhere else.",
          },
        ],
      },
      {
        heading: "Make every entry carry a number",
        blocks: [
          {
            kind: "text",
            body: "The difference between a SWOT that reads as analysis and one that reads as filler is almost always quantification. Not every entry can carry a figure, but most can, and the ones that cannot are usually the ones that were vague to begin with.",
          },
          {
            kind: "table",
            caption: "The same entry, before and after",
            columns: ["Generic", "Specific"],
            rows: [
              ["Strong local reputation", "4.7 average across 340 reviews, ahead of the two nearest competitors"],
              ["Limited working capital", "Lowest projected cash is $26k in month sixteen, against $41k of monthly fixed cost"],
              ["Growing market", "Catchment population up 8% since the last census; three new residential developments permitted"],
              ["Supply chain risk", "68% of ingredient cost sits with one distributor on 30-day terms"],
            ],
          },
        ],
      },
      {
        heading: "The part everyone skips: pairing",
        blocks: [
          {
            kind: "text",
            body: "A SWOT becomes useful when you cross the boxes against each other and write down what each pairing implies. This is the step that turns four lists into four decisions.",
          },
          {
            kind: "steps",
            items: [
              { title: "Strength × Opportunity", body: "What do you do first, because you are already well placed to do it? This is usually where the plan's next ninety days come from." },
              { title: "Strength × Threat", body: "What protects you? Write the sentence — it is the closest thing most small businesses have to a moat statement." },
              { title: "Weakness × Opportunity", body: "What are you going to miss unless you fix something? Frequently the clearest justification for the use of funds." },
              { title: "Weakness × Threat", body: "The uncomfortable box. Where the business is genuinely exposed, and what the mitigation is. A reader who finds it here respects it; the same reader who finds it themselves does not." },
            ],
          },
          {
            kind: "callout",
            title: "If nothing changed, it did not work",
            body: "A SWOT that produces no decision — no hire moved, no line added to the use of funds, no risk mitigation written — was a formatting exercise. Delete it and use the page for something else.",
          },
        ],
      },
    ],
    related: [
      { label: "Business model canvas", href: "/learn/business-model-canvas" },
      { label: "How to write a business plan", href: "/learn/how-to-write-a-business-plan" },
      { label: "Sector risks, by industry", href: "/industries" },
    ],
  },

  {
    slug: "business-model-canvas",
    title: "The business model canvas, and what to do with it afterwards",
    summary:
      "Nine boxes on one page, why the order you fill them in matters, and how to connect each one to a number in the model.",
    query: "business model canvas",
    demand: { volume: 12_100, difficulty: 64 },
    updated: UPDATED,
    lede:
      "The canvas is the best thinking tool in this whole category and the worst plan section. It is built for a whiteboard and an argument; pasted into a document as a picture of nine boxes it says almost nothing.",
    sections: [
      {
        heading: "Fill it in in this order",
        blocks: [
          {
            kind: "text",
            body: "Left to right is the conventional layout and the wrong sequence. Start in the middle with the value proposition, go right to the customer, then left to how you deliver it, and finish with the two financial blocks — because those are consequences of everything else, not inputs to it.",
          },
          {
            kind: "steps",
            items: [
              { title: "1. Value proposition", body: "The specific job you do for a specific person. If it applies to everybody, the canvas will be wrong in eight other places." },
              { title: "2. Customer segments", body: "Who exactly. Not “small businesses” — small businesses of what kind, with what problem, at what stage." },
              { title: "3. Channels and relationships", body: "How they find you and what keeps them. Both have a cost, and both belong in the model." },
              { title: "4. Key activities, resources and partners", body: "What you actually have to do and own. This is where capacity limits become visible." },
              { title: "5. Cost structure and revenue streams", body: "Last, because they fall out of the four above. Filling these in first is how a canvas ends up describing a business nobody is running." },
            ],
          },
        ],
      },
      {
        heading: "Connect every box to a number",
        blocks: [
          {
            kind: "text",
            body: "The single biggest improvement you can make to a canvas is to refuse to leave any box unconnected to the financial model. It converts a diagram into a set of claims, and claims can be checked.",
          },
          {
            kind: "table",
            caption: "Where each block lands in the model",
            columns: ["Canvas block", "The model variable it drives"],
            rows: [
              ["Customer segments", "The population count at the top of the bottom-up market build"],
              ["Value proposition", "Price, and the share of the qualified population who convert"],
              ["Channels", "Acquisition cost, and the monthly marketing spend that implies"],
              ["Customer relationships", "Churn, repeat rate, and therefore lifetime value"],
              ["Revenue streams", "The driver build itself — units, seats, covers, contracts"],
              ["Key resources and activities", "Headcount, capacity ceiling, and the capital expenditure to reach it"],
              ["Key partners", "Cost of goods, supplier terms, and the payables cycle"],
              ["Cost structure", "Fixed opex, the direct cost per unit, and the break-even that follows"],
            ],
          },
        ],
      },
      {
        heading: "What belongs in the plan",
        blocks: [
          {
            kind: "text",
            body: "Not the grid. The output of the grid: a paragraph on who the customer is and what job you do for them, a paragraph on how they reach you and what that costs, and a model whose drivers are visibly the same ones the canvas named.",
          },
          {
            kind: "callout",
            title: "Where canvases mislead",
            body: "Every box looks equally important because every box is the same size. They are not. In most businesses one or two blocks decide the outcome — usually channels or key resources — and the canvas's even grid actively hides that. Sensitivity analysis on the model is the corrective: it ranks which assumption actually moves the answer, and it is rarely the one you spent longest on.",
          },
        ],
      },
    ],
    related: [
      { label: "SWOT analysis", href: "/learn/swot-analysis" },
      { label: "Unit economics calculator", href: "/tools/unit-economics" },
      { label: "Market sizing calculator", href: "/tools/tam-sam-som" },
    ],
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/** Rough reading time from the article's own body, so it cannot be overstated. */
export function readingMinutes(article: Article): number {
  const words = article.sections
    .flatMap((s) => s.blocks)
    .reduce((count, block) => {
      switch (block.kind) {
        case "text":
          return count + block.body.split(/\s+/).length;
        case "list":
          return count + block.items.join(" ").split(/\s+/).length;
        case "steps":
          return count + block.items.map((i) => `${i.title} ${i.body}`).join(" ").split(/\s+/).length;
        case "callout":
          return count + block.body.split(/\s+/).length;
        case "table":
          return count + block.rows.flat().join(" ").split(/\s+/).length;
      }
    }, article.lede.split(/\s+/).length);
  return Math.max(1, Math.round(words / 220));
}

/** Most searched first — the order they were worth writing in. */
export function articlesByDemand(): Article[] {
  return [...ARTICLES].sort((a, b) => b.demand.volume - a.demand.volume);
}
