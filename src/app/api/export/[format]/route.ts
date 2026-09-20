import { NextResponse, type NextRequest } from "next/server";
import { getSession, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions } from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { assembleReview } from "@/lib/review/assemble";
import { buildExportDocument } from "@/lib/export/document";
import { buildWorkbook } from "@/lib/export/xlsx";
import { buildDocx } from "@/lib/export/docx";
import { buildDeck } from "@/lib/export/pptx";
import { renderPdf } from "@/lib/export/pdf";
import { generatorKind } from "@/lib/ai";

/* ==========================================================================
   Export.
   --------------------------------------------------------------------------
   Gated on the review, deliberately. The product's claim is that what leaves
   here survives scrutiny, and a file that ships with the balance sheet broken
   or a figure in the prose that the model never produced would make that claim
   false the first time anyone checked. So the gate is the same validator the
   review page shows, and the response says exactly what is blocking rather
   than refusing flatly.
   ========================================================================== */

export const dynamic = "force-dynamic";
/** The PDF launches a browser; the rest are fast. */
export const maxDuration = 300;

const FORMATS = {
  pdf: { extension: "pdf", type: "application/pdf" },
  xlsx: { extension: "xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  docx: { extension: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  pptx: { extension: "pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
} as const;

type Format = keyof typeof FORMATS;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ format: string }> },
) {
  const { format } = await params;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: `Unknown format "${format}".` }, { status: 400 });
  }
  const spec = FORMATS[format as Format];

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const planId = request.nextUrl.searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "No plan specified." }, { status: 400 });

  const workspace = await getOrCreateWorkspace(session.user.id, session.user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  const assumptions = parseAssumptions(plan.assumptionsJson);
  if (!plan.intakeComplete || !assumptions) {
    return NextResponse.json(
      { error: "Finish the intake first — there is no model to export." },
      { status: 409 },
    );
  }

  const { validation } = assembleReview(plan, assumptions);
  if (!validation.canExport) {
    const blocking = validation.findings.filter((f) => f.severity === "blocking");
    return NextResponse.json(
      {
        error: "Export is locked until the blocking findings are resolved.",
        blocking: blocking.map((f) => ({ id: f.id, title: f.title, remedy: f.remedy })),
      },
      { status: 409 },
    );
  }

  const model = buildModel(assumptions);
  const doc = buildExportDocument({
    plan,
    assumptions,
    model,
    metrics: computeMetrics(model),
    generator: generatorKind(),
  });

  let body: Buffer;
  try {
    if (format === "pdf") {
      const origin = request.nextUrl.origin;
      body = await renderPdf({
        url: `${origin}/print/${plan.id}`,
        origin,
        // Chromium gets the caller's own session, so the pipeline has exactly
        // the access the person clicking export already had.
        cookies: request.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
        footerLeft: `${doc.companyName} · ${doc.preparedOn}`,
      });
    } else if (format === "xlsx") {
      body = await buildWorkbook(doc);
    } else if (format === "docx") {
      body = await buildDocx(doc);
    } else {
      body = await buildDeck(doc);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The export failed." },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": spec.type,
      "Content-Disposition": `attachment; filename="${filename(doc.companyName, doc.preparedOn, spec.extension)}"`,
      "Cache-Control": "no-store",
    },
  });
}

function filename(company: string, date: string, extension: string): string {
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "business-plan";
  return `${slug}-business-plan-${date}.${extension}`;
}
