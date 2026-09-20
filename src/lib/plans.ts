import "server-only";
import { db } from "./db";
import { AssumptionsSchema, type Assumptions, type AssumptionRegistry } from "./finance/types";
import { PLAN_SECTIONS } from "@/lib/content/sections";

/* ==========================================================================
   Plan persistence.
   --------------------------------------------------------------------------
   Assumptions are stored as a JSON string rather than relational columns: the
   engine always loads them whole, the shape is owned by a Zod schema that will
   keep evolving, and text columns behave identically on SQLite and Postgres.
   ========================================================================== */

export { PLAN_SECTIONS, type PlanSectionKey } from "@/lib/content/sections";

export type PlanSummary = {
  id: string;
  title: string;
  companyName: string;
  industryKey: string;
  purpose: string;
  status: string;
  intakeStep: number;
  intakeComplete: boolean;
  updatedAt: Date;
  unlockedAt: Date | null;
};

/** Creates an empty plan with its section skeleton in one transaction. */
export async function createPlan(input: {
  workspaceId: string;
  userId: string;
  title: string;
}) {
  return db.plan.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.userId,
      title: input.title,
      status: "intake",
      sections: {
        create: PLAN_SECTIONS.map((section, index) => ({
          key: section.key,
          title: section.title,
          position: index,
          status: "empty",
        })),
      },
    },
  });
}

export async function listPlans(workspaceId: string): Promise<PlanSummary[]> {
  return db.plan.findMany({
    where: { workspaceId, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, companyName: true, industryKey: true,
      purpose: true, status: true, intakeStep: true, intakeComplete: true,
      updatedAt: true, unlockedAt: true,
    },
  });
}

/** Loads a plan, scoped to the workspace so an id alone is not authorisation. */
export async function getPlan(planId: string, workspaceId: string) {
  return db.plan.findFirst({
    where: { id: planId, workspaceId },
    include: { sections: { orderBy: { position: "asc" } } },
  });
}

/**
 * Parses the stored assumptions. Returns null when intake has not produced a
 * complete set yet — callers must handle that rather than receive a half-built
 * object the engine would choke on.
 */
export function parseAssumptions(json: string): Assumptions | null {
  if (!json || json === "{}") return null;
  try {
    const parsed = AssumptionsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseRegistry(json: string): AssumptionRegistry {
  if (!json) return {};
  try {
    return JSON.parse(json) as AssumptionRegistry;
  } catch {
    return {};
  }
}

export function parseContext(json: string): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Snapshots current state before a destructive change. */
export async function snapshotPlan(planId: string, label: string, reason: string) {
  const plan = await db.plan.findUnique({
    where: { id: planId },
    include: { sections: true },
  });
  if (!plan) return null;

  return db.planVersion.create({
    data: {
      planId,
      label,
      reason,
      snapshotJson: JSON.stringify({
        assumptions: plan.assumptionsJson,
        registry: plan.registryJson,
        context: plan.contextJson,
        sections: plan.sections.map((s) => ({
          key: s.key, status: s.status, contentJson: s.contentJson, contentText: s.contentText,
        })),
      }),
    },
  });
}
