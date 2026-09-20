import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntakeWizard } from "@/components/app/intake/wizard";
import { INTAKE_STEPS } from "@/lib/content/intake";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import type { IntakeState, ProvenanceState } from "@/lib/content/intake-mapper";

export const metadata: Metadata = { title: "Intake" };

export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { planId } = await params;
  const { step: requestedStep } = await searchParams;
  const user = await requireUser(`/plans/${planId}/intake`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);

  const plan = await db.plan.findFirst({
    where: { id: planId, workspaceId: workspace.id },
    select: {
      id: true, title: true, intakeStep: true, intakeComplete: true,
      assumptionsJson: true, registryJson: true, contextJson: true,
    },
  });
  if (!plan) notFound();

  // The flat wizard answers always live in context.intakeState; assumptionsJson
  // holds only the mapped Assumptions object. Keeping the two apart is what
  // stops a late autosave writing flat keys over a completed model.
  const context = safeJson<{ intakeState?: IntakeState }>(plan.contextJson, {});
  const state = context.intakeState ?? {};
  const provenance = safeJson<ProvenanceState>(plan.registryJson, {});

  // The fix-it queue links to the step that owns the driver a finding is about,
  // so a warning about cost assumptions opens on costs rather than wherever the
  // wizard was last left. Anything unparseable falls back to the saved step.
  const parsed = Number(requestedStep);
  const deepLinked =
    requestedStep !== undefined && Number.isInteger(parsed) && parsed >= 0 && parsed < INTAKE_STEPS.length
      ? parsed
      : null;

  return (
    <IntakeWizard
      planId={plan.id}
      planTitle={plan.title}
      initialState={state}
      initialProvenance={provenance}
      initialStep={deepLinked ?? plan.intakeStep}
    />
  );
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
