import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { siteUrl } from "@/lib/env";
import { createPlan, getPlan, listPlans, parseAssumptions, PLAN_SECTIONS } from "@/lib/plans";
import { applyIntake, buildGenerationContext, readIntake, writeSection } from "@/lib/plan-service";
import { assembleReview } from "@/lib/review/assemble";
import { buildStatements } from "@/lib/finance/statements";
import { ProvenanceSchema } from "@/lib/finance/types";
import { INTAKE_STEPS } from "@/lib/content/intake";
import { buildFactsBlock, getGenerator } from "@/lib/ai";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/ai/prompts";
import { CitationSchema, CompetitorSchema, upsertCitation, upsertCompetitor } from "@/lib/market/evidence";
import {
  REVENUE_KINDS,
  benchmarkDefaults,
  describeIntake,
  kindOf,
  mergeAnswers,
  missingRequired,
  seedIntake,
  validateAnswers,
} from "./intake";

/* ==========================================================================
   The MCP tools.
   --------------------------------------------------------------------------
   Every tool acts as one person on one workspace, resolved from the access
   token before any of this runs. A plan id is never authorisation: every
   lookup is scoped to that workspace, exactly as the app's own actions are.

   The division of labour is the product's, unchanged. A client supplies
   assumptions and prose; the engine computes every figure; the consistency
   checker holds prose to the engine. Nothing here accepts a number that lands
   in a financial statement.
   ========================================================================== */

export type McpCaller = {
  userId: string;
  workspaceId: string;
  scopes: ReadonlySet<string>;
};

const SECTION_KEYS = PLAN_SECTIONS.map((s) => s.key) as [string, ...string[]];

const planUrl = (planId: string, path = "") => `${siteUrl}/plans/${planId}${path}`;

function reply(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function refuse(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

const NOT_FOUND = "No plan with that id in this workspace. `list_plans` shows the ones there are.";

/** Rounded for reading. The model stays at full precision; this is the edge. */
function display(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  }
  if (Array.isArray(value)) return value.map(display);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, display(v)]));
  }
  return value;
}

export function registerTools(server: McpServer, caller: McpCaller) {
  const can = (scope: "plans:read" | "plans:write") => caller.scopes.has(scope);
  const needsWrite = () =>
    can("plans:write") ? null : refuse("This connection was granted read access only (plans:read).");

  /* ---- Reading ---------------------------------------------------------- */

  server.registerTool(
    "get_intake_questions",
    {
      title: "Get the intake questions",
      description:
        "The questionnaire a Venturelly plan is built from: every question, its key, type, limits and guidance, " +
        "plus the revenue models, industries and plan purposes to choose from. The revenue questions depend on " +
        "the revenue model, so pass `revenueModel` once you know it. Ask the person these questions — do not " +
        "invent answers for them.",
      inputSchema: { revenueModel: z.enum(REVENUE_KINDS).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ revenueModel }) => reply(describeIntake(revenueModel)),
  );

  server.registerTool(
    "list_plans",
    {
      title: "List plans",
      description: "The plans in this workspace, most recently changed first.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const plans = await listPlans(caller.workspaceId);
      return reply(
        plans.map((p) => ({
          planId: p.id,
          title: p.title,
          companyName: p.companyName,
          industry: p.industryKey,
          purpose: p.purpose,
          status: p.status,
          intakeComplete: p.intakeComplete,
          updatedAt: p.updatedAt.toISOString(),
          url: planUrl(p.id),
        })),
      );
    },
  );

  server.registerTool(
    "get_plan",
    {
      title: "Get a plan",
      description:
        "One plan: its intake answers with the source of each (known, estimated, or an industry default), " +
        "what is still unanswered, and the state of every section.",
      inputSchema: { planId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ planId }) => {
      const plan = await getPlan(planId, caller.workspaceId);
      if (!plan) return refuse(NOT_FOUND);
      const { state, provenance } = readIntake(plan);
      return reply({
        planId: plan.id,
        title: plan.title,
        companyName: plan.companyName,
        status: plan.status,
        intakeComplete: plan.intakeComplete,
        answers: state,
        sources: provenance,
        missingRequired: missingRequired(state),
        stillIndustryDefaults: benchmarkDefaults(state, provenance),
        sections: plan.sections.map((s) => ({
          key: s.key,
          title: s.title,
          status: s.status,
          words: s.contentText.trim() ? s.contentText.trim().split(/\s+/).length : 0,
        })),
        competitors: plan.competitors.length,
        citations: plan.citations.length,
        url: planUrl(plan.id),
      });
    },
  );

  server.registerTool(
    "get_financials",
    {
      title: "Get the financial statements",
      description:
        "The profit and loss, cash flow and balance sheet the engine computed from the intake answers, with " +
        "break-even, cash, unit economics and lender ratios, and every finding the validator raised. These " +
        "figures are the only ones a plan may quote. `view: monthly` gives the first year by month.",
      inputSchema: {
        planId: z.string().min(1),
        view: z.enum(["annual", "monthly"]).default("annual"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ planId, view }) => {
      const plan = await getPlan(planId, caller.workspaceId);
      if (!plan) return refuse(NOT_FOUND);
      const assumptions = parseAssumptions(plan.assumptionsJson);
      if (!assumptions) {
        return refuse("The intake is not complete enough to build a model yet. `get_plan` lists what is missing.");
      }
      const { model, metrics, validation } = assembleReview(plan, assumptions);
      return reply({
        currency: assumptions.company.currency,
        statements: display(
          buildStatements(model, view).map((table) => ({
            title: table.title,
            columns: table.columns,
            rows: table.rows.map((r) => ({ label: r.label, kind: r.kind, values: r.values })),
          })),
        ),
        metrics: display(metrics),
        findings: validation.findings.map((f) => ({
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          remedy: f.remedy,
        })),
        url: planUrl(plan.id, "/financials"),
      });
    },
  );

  server.registerTool(
    "get_section_brief",
    {
      title: "Get a section brief",
      description:
        "Everything needed to write one section yourself: the house rules, what the section must do, the " +
        "figures the engine computed (the only figures the prose may contain), and the sections already " +
        "written. Write the section from this, then save it with `write_section`.",
      inputSchema: { planId: z.string().min(1), sectionKey: z.enum(SECTION_KEYS) },
      annotations: { readOnlyHint: true },
    },
    async ({ planId, sectionKey }) => {
      const built = await buildGenerationContext({ workspaceId: caller.workspaceId, planId, sectionKey });
      if (!built.ok) return refuse(built.status === 404 ? NOT_FOUND : built.error);
      return {
        content: [
          { type: "text", text: `<rules>\n${SYSTEM_PROMPT}\n</rules>` },
          { type: "text", text: buildUserMessage(built.context, buildFactsBlock(built.context)) },
        ],
      };
    },
  );

  server.registerTool(
    "review_plan",
    {
      title: "Review a plan",
      description:
        "Scores the plan the way its reader would — a lender, an investor or an adjudicator — and lists what " +
        "to fix, blocking items first. Every figure in the written sections is checked against the model.",
      inputSchema: { planId: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ planId }) => {
      const plan = await getPlan(planId, caller.workspaceId);
      if (!plan) return refuse(NOT_FOUND);
      const assumptions = parseAssumptions(plan.assumptionsJson);
      if (!plan.intakeComplete || !assumptions) {
        return refuse("The intake is not finished, so there is nothing to review yet.");
      }
      const { readiness, consistency, queue, validation } = assembleReview(plan, assumptions);
      return reply({
        readiness: {
          score: readiness.score,
          band: readiness.bandLabel,
          verdict: readiness.verdict,
          heldBackByBlockingFindings: readiness.cappedByBlocking,
          dimensions: readiness.dimensions.map((d) => ({ label: d.label, score: display(d.score) })),
        },
        canExport: validation.canExport,
        figuresInProse: {
          checked: consistency.checkedCount,
          traceToModel: consistency.reconciledCount,
          carriedByCitation: consistency.sourcedCount,
          unsupported: consistency.findings.length,
        },
        toFix: queue.map((item) => ({
          severity: item.severity,
          title: item.title,
          detail: item.detail,
          remedy: item.remedy,
        })),
        url: planUrl(plan.id, "/review"),
        exportUrl: planUrl(plan.id, "/export"),
      });
    },
  );

  /* ---- Writing ---------------------------------------------------------- */

  const answersSchema = z
    .record(z.string(), z.union([z.string(), z.number()]))
    .describe("Answers keyed by question key, from `get_intake_questions`.");
  const sourcesSchema = z
    .record(z.string(), ProvenanceSchema.exclude(["benchmark_default"]))
    .optional()
    .describe(
      "For each answer: `known` if the person stated it, `estimated` if it is their estimate or yours. " +
        "Defaults to `estimated`. This is printed in the plan, so do not mark a guess as known.",
    );

  server.registerTool(
    "create_plan",
    {
      title: "Create a plan",
      description:
        "Starts a new plan. It begins with the industry's typical values, each marked as an industry default " +
        "in the finished plan; replace them with the person's own answers through `answer_intake`. Returns the " +
        "plan id, the required questions still unanswered, and the defaults still standing.",
      inputSchema: {
        title: z.string().min(1).max(120),
        industry: z.string().describe("An industry `value` from `get_intake_questions`."),
        revenueModel: z.enum(REVENUE_KINDS).optional(),
        answers: answersSchema.optional(),
        sources: sourcesSchema,
      },
    },
    async ({ title, industry, revenueModel, answers = {}, sources = {} }) => {
      const denied = needsWrite();
      if (denied) return denied;

      const seeded = seedIntake("other", revenueModel);
      const industryCheck = validateAnswers({ "company.industryKey": industry }, seeded.state);
      if (industryCheck.errors.length > 0) return refuse(industryCheck.errors[0]!.message);

      const start = seedIntake(industry, revenueModel);
      const { accepted, errors, warnings } = validateAnswers(answers, start.state);
      const merged = mergeAnswers(start, accepted, sources);

      const plan = await createPlan({ workspaceId: caller.workspaceId, userId: caller.userId, title });
      const saved = await saveAnswers(plan.id, merged, false, 0);
      return reply({ planId: plan.id, ...saved, rejected: errors, warnings, url: planUrl(plan.id) });
    },
  );

  server.registerTool(
    "answer_intake",
    {
      title: "Answer intake questions",
      description:
        "Records answers on a plan, merged into what is there. Invalid answers are returned by key and nothing " +
        "else is affected. Changing the revenue model resets the revenue answers to that model's defaults. " +
        "Pass `complete: true` once the person has answered — the plan is then built and can be reviewed and " +
        "written; it is refused while a required question is unanswered.",
      inputSchema: {
        planId: z.string().min(1),
        answers: answersSchema,
        sources: sourcesSchema,
        complete: z.boolean().default(false),
      },
    },
    async ({ planId, answers, sources = {}, complete }) => {
      const denied = needsWrite();
      if (denied) return denied;

      const plan = await getPlan(planId, caller.workspaceId);
      if (!plan) return refuse(NOT_FOUND);
      const current = readIntake(plan);
      const { accepted, errors, warnings } = validateAnswers(answers, current.state);
      const merged = mergeAnswers(current, accepted, sources);
      const saved = await saveAnswers(plan.id, merged, complete, plan.intakeStep);
      return reply({ planId: plan.id, ...saved, rejected: errors, warnings, url: planUrl(plan.id) });
    },
  );

  async function saveAnswers(
    planId: string,
    answers: ReturnType<typeof mergeAnswers>,
    complete: boolean,
    currentStep: number,
  ) {
    const missing = missingRequired(answers.state);
    const result = await applyIntake(caller.workspaceId, {
      planId,
      // In the wizard's own terms, so the app shows the right progress: the
      // review step once complete, otherwise wherever the plan already was.
      // Writing a lower step makes the dashboard's progress bar go backwards.
      step: complete && missing.length === 0 ? INTAKE_STEPS.length : currentStep,
      complete: complete && missing.length === 0,
      assumptions: answers.state,
      registry: answers.provenance,
      companyName: String(answers.state["company.name"] ?? ""),
      industryKey: String(answers.state["company.industryKey"] ?? "other"),
      purpose: String(answers.state["company.purpose"] ?? "internal"),
    });
    return {
      intakeComplete: result?.intakeComplete ?? false,
      modelBuilds: result?.mapped ?? false,
      revenueModel: kindOf(answers.state),
      missingRequired: missing,
      stillIndustryDefaults: benchmarkDefaults(answers.state, answers.provenance),
      ...(complete && missing.length > 0
        ? { notCompleted: "Required questions are unanswered; see missingRequired." }
        : {}),
    };
  }

  server.registerTool(
    "write_section",
    {
      title: "Write a section",
      description:
        "Saves prose you wrote for a section (start from `get_section_brief`), replacing what is there — the " +
        "previous text is kept as a restorable version. Every figure in it is then checked against the model; " +
        "any that do not trace to a computed value or a cited source are returned, and they will hold the " +
        "plan back in review until corrected.",
      inputSchema: {
        planId: z.string().min(1),
        sectionKey: z.enum(SECTION_KEYS),
        text: z.string().min(1).max(60_000).describe("Plain paragraphs separated by blank lines."),
      },
    },
    async ({ planId, sectionKey, text }) => {
      const denied = needsWrite();
      if (denied) return denied;

      const built = await buildGenerationContext({ workspaceId: caller.workspaceId, planId, sectionKey });
      if (!built.ok) return refuse(built.status === 404 ? NOT_FOUND : built.error);
      await writeSection({
        planId,
        sectionKey,
        sectionTitle: built.context.sectionTitle,
        text,
        status: "edited",
        hadContent: built.hadContent,
        snapshotLabel: `Before "${built.context.sectionTitle}" was written over MCP`,
      });
      return reply({ saved: true, ...(await checkSectionFigures(planId, sectionKey)) });
    },
  );

  server.registerTool(
    "generate_section",
    {
      title: "Generate a section",
      description:
        "Has Venturelly write a section from the model and the plan's evidence, replacing what is there (the " +
        "previous text is kept as a restorable version). Use `instruction` to steer a rewrite. Can take a " +
        "minute or two.",
      inputSchema: {
        planId: z.string().min(1),
        sectionKey: z.enum(SECTION_KEYS),
        instruction: z.string().max(2000).optional(),
      },
    },
    async ({ planId, sectionKey, instruction }) => {
      const denied = needsWrite();
      if (denied) return denied;

      const built = await buildGenerationContext({
        workspaceId: caller.workspaceId,
        planId,
        sectionKey,
        ...(instruction ? { instruction } : {}),
      });
      if (!built.ok) return refuse(built.status === 404 ? NOT_FOUND : built.error);

      let text = "";
      for await (const chunk of getGenerator().generateSection(built.context)) {
        if (chunk.type === "error") return refuse(`Generation failed: ${chunk.message}`);
        if (chunk.type === "done") text = chunk.text;
      }
      await writeSection({
        planId,
        sectionKey,
        sectionTitle: built.context.sectionTitle,
        text,
        status: "draft",
        hadContent: built.hadContent,
        snapshotLabel: `Before regenerating "${built.context.sectionTitle}"`,
      });
      return reply({ text, ...(await checkSectionFigures(planId, sectionKey)) });
    },
  );

  /** The review's own consistency check, read back for one section. */
  async function checkSectionFigures(planId: string, sectionKey: string) {
    const plan = await getPlan(planId, caller.workspaceId);
    const assumptions = plan && parseAssumptions(plan.assumptionsJson);
    if (!plan || !assumptions) return {};
    const { consistency } = assembleReview(plan, assumptions);
    const findings = consistency.findings.filter((f) => f.sectionKey === sectionKey);
    return {
      unsupportedFigures: findings.map((f) => ({
        figure: f.figure.raw,
        ...(f.nearest
          ? { nearestComputed: { label: f.nearest.label, value: display(f.nearest.value) } }
          : { needs: "a citation (`add_citation`), or remove it" }),
      })),
      url: planUrl(planId, `/sections/${sectionKey}`),
    };
  }

  server.registerTool(
    "add_competitor",
    {
      title: "Add a competitor",
      description:
        "Adds a competitor to the plan's market evidence. Give a link and the date the price was seen " +
        "(yyyy-mm-dd): undated evidence does not count toward review, because a reader discounts it.",
      inputSchema: {
        planId: z.string().min(1),
        ...CompetitorSchema.omit({ id: true, planId: true, origin: true }).shape,
        origin: CompetitorSchema.shape.origin.describe(
          "`owner` if the person told you about it, `research` if you found it.",
        ),
      },
    },
    async (input) => {
      const denied = needsWrite();
      if (denied) return denied;
      const plan = await getPlan(input.planId, caller.workspaceId);
      if (!plan) return refuse(NOT_FOUND);
      const parsed = CompetitorSchema.safeParse({ ...input, planId: plan.id });
      if (!parsed.success) return refuse(parsed.error.issues.map((i) => i.message).join("; "));
      const id = await upsertCompetitor(parsed.data);
      return reply({
        competitorId: id,
        countsAsEvidence: Boolean(parsed.data.url && parsed.data.priceDate),
        url: planUrl(plan.id, "/market"),
      });
    },
  );

  server.registerTool(
    "add_citation",
    {
      title: "Add a citation",
      description:
        "Records a source for an outside claim — a market size, a growth rate, a regulation — so prose can " +
        "quote it. Needs the address of the source and its publication date: a citation that cannot be " +
        "followed and dated is not accepted. Put the figure itself in `claim` exactly as the prose will " +
        "write it, so the consistency check can match the two.",
      inputSchema: {
        planId: z.string().min(1),
        ...CitationSchema.omit({ id: true, planId: true, url: true }).shape,
        url: z.string().max(1000).regex(/^https?:\/\//, "Must be an http(s) address"),
        sectionKey: z.enum(SECTION_KEYS).optional(),
      },
    },
    async (input) => {
      const denied = needsWrite();
      if (denied) return denied;
      const plan = await getPlan(input.planId, caller.workspaceId);
      if (!plan) return refuse(NOT_FOUND);
      const parsed = CitationSchema.safeParse({ ...input, planId: plan.id });
      if (!parsed.success) return refuse(parsed.error.issues.map((i) => i.message).join("; "));
      const id = await upsertCitation(parsed.data);
      return reply({ citationId: id, url: planUrl(plan.id, "/market") });
    },
  );
}
