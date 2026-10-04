import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, getOrCreateWorkspace } from "@/lib/session";
import { snapshotPlan } from "@/lib/plans";
import { buildGenerationContext, toDocument } from "@/lib/plan-service";
import { getGenerator } from "@/lib/ai";

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
  const built = await buildGenerationContext({
    workspaceId: workspace.id,
    planId,
    sectionKey,
    ...(instruction ? { instruction } : {}),
  });
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
  const { context } = built;
  const plan = { id: context.planId };

  // Snapshot before overwriting, so a regeneration is always reversible — the
  // failure the incumbent's own users complain about.
  if (built.hadContent) {
    await snapshotPlan(plan.id, `Before regenerating "${context.sectionTitle}"`, "regeneration");
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
                data: { status: built.hadContent ? "draft" : "empty" },
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
