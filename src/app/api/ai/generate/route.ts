import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, getOrCreateWorkspace } from "@/lib/session";
import {
  getPlan,
  parseAssumptions,
  parseResilience,
  parseSizing,
  snapshotPlan,
  PLAN_SECTIONS,
} from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { getGenerator } from "@/lib/ai";
import type { GenerationContext } from "@/lib/ai/types";

/** Generation can run for minutes; never let a platform default cut it short. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  planId: z.string().min(1),
  sectionKey: z.string().min(1),
  instruction: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { planId, sectionKey, instruction } = parsed.data;

  const workspace = await getOrCreateWorkspace(session.user.id, session.user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const section = PLAN_SECTIONS.find((s) => s.key === sectionKey);
  if (!section) return NextResponse.json({ error: "Unknown section" }, { status: 400 });

  const assumptions = parseAssumptions(plan.assumptionsJson);
  if (!assumptions) {
    return NextResponse.json(
      { error: "Finish the intake before generating — there is no model to write against." },
      { status: 409 },
    );
  }

  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);

  // Earlier sections are supplied so later ones do not contradict them.
  const written = plan.sections
    .filter((s) => s.contentText.trim().length > 0 && s.key !== sectionKey)
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ key: s.key, title: s.title, text: s.contentText }));

  const context: GenerationContext = {
    planId: plan.id,
    sectionKey,
    sectionTitle: section.title,
    companyName: plan.companyName || plan.title,
    industryKey: plan.industryKey,
    purpose: plan.purpose,
    description: readDescription(plan.contextJson),
    assumptions,
    model,
    metrics,
    ...(instruction ? { instruction } : {}),
    written,
    // The market page's evidence travels with the request, which is what lets
    // a market section be written from named competitors and dated sources
    // rather than from adjectives.
    market: {
      sizing: parseSizing(plan.marketJson),
      competitors: plan.competitors.map((c) => ({
        name: c.name,
        url: c.url,
        positioning: c.positioning,
        priceLabel: c.priceLabel,
        priceDate: c.priceDate,
        strengths: c.strengths,
        weaknesses: c.weaknesses,
      })),
      citations: plan.citations.map((c) => ({
        label: c.label,
        url: c.url,
        publisher: c.publisher,
        sourceDate: c.sourceDate,
        claim: c.claim,
      })),
    },
    resilience: parseResilience(plan.resilienceJson),
  };

  // Snapshot before overwriting, so a regeneration is always reversible — the
  // failure the incumbent's own users complain about.
  const existing = plan.sections.find((s) => s.key === sectionKey);
  if (existing && existing.contentText.trim().length > 0) {
    await snapshotPlan(plan.id, `Before regenerating "${section.title}"`, "regeneration");
  }

  await db.planSection.updateMany({
    where: { planId: plan.id, key: sectionKey },
    data: { status: "generating" },
  });

  const generator = getGenerator();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("meta", { generator: generator.kind, section: sectionKey });

        let finalText = "";
        for await (const chunk of generator.generateSection(context)) {
          switch (chunk.type) {
            case "status":
              send("status", { message: chunk.message });
              break;
            case "text":
              send("delta", { text: chunk.text });
              break;
            case "done":
              finalText = chunk.text;
              break;
            case "error":
              send("error", { message: chunk.message });
              await db.planSection.updateMany({
                where: { planId: plan.id, key: sectionKey },
                data: { status: existing?.contentText ? "draft" : "empty" },
              });
              controller.close();
              return;
          }
        }

        await db.planSection.updateMany({
          where: { planId: plan.id, key: sectionKey },
          data: {
            status: "draft",
            contentText: finalText,
            contentJson: JSON.stringify(toDocument(finalText)),
          },
        });
        await db.plan.update({
          where: { id: plan.id },
          data: { status: "ready", updatedAt: new Date() },
        });

        send("done", { text: finalText });
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Generation failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops proxies buffering the stream into one lump.
      "X-Accel-Buffering": "no",
    },
  });
}

function readDescription(contextJson: string): string {
  try {
    const parsed = JSON.parse(contextJson || "{}") as {
      intakeState?: Record<string, unknown>;
      description?: unknown;
    };
    const fromIntake = parsed.intakeState?.["context.description"];
    return String(fromIntake ?? parsed.description ?? "");
  } catch {
    return "";
  }
}

/** Plain text -> a TipTap-shaped document, so the editor can load it directly. */
function toDocument(text: string) {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => ({
        type: "paragraph",
        content: [{ type: "text", text: para }],
      })),
  };
}
