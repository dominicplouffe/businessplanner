import { notFound } from "next/navigation";
import { PlanDocument } from "@/components/print/plan-document";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions } from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { buildExportDocument } from "@/lib/export/document";
import { generatorKind } from "@/lib/ai";

/* The route the PDF pipeline renders. It is authenticated like any other page:
   Chromium is handed the requesting user's session, so a plan cannot be
   printed by anyone who could not already open it. */
export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const user = await requireUser(`/print/${planId}`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  if (!plan.intakeComplete || !assumptions) notFound();

  const model = buildModel(assumptions);
  const doc = buildExportDocument({
    plan,
    assumptions,
    model,
    metrics: computeMetrics(model),
    generator: generatorKind(),
  });

  return <PlanDocument doc={doc} />;
}
