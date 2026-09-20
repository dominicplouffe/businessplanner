import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { PlanDocument } from "@/components/print/plan-document";
import { db } from "@/lib/db";
import { parseAssumptions } from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { buildExportDocument } from "@/lib/export/document";
import { resolveShareToken, recordShareView } from "@/lib/share";
import { generatorKind } from "@/lib/ai";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared plan",
  robots: { index: false, follow: false },
};

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveShareToken(token);

  if (access.status !== "ok") return <Unavailable status={access} />;

  const plan = await db.plan.findUnique({
    where: { id: access.planId },
    include: {
      sections: { orderBy: { position: "asc" } },
      competitors: { orderBy: { position: "asc" } },
      citations: { orderBy: { createdAt: "asc" } },
    },
  });
  const assumptions = plan ? parseAssumptions(plan.assumptionsJson) : null;
  if (!plan || !assumptions) return <Unavailable status={{ status: "missing" }} />;

  // Recorded before rendering, so a reader who closes the tab early still
  // counts. The open is the signal a founder wants, not the dwell time.
  const headerList = await headers();
  await recordShareView({
    shareLinkId: access.shareLinkId,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
  });

  const model = buildModel(assumptions);
  const doc = buildExportDocument({
    plan,
    assumptions,
    model,
    metrics: computeMetrics(model),
    generator: generatorKind(),
  });

  return (
    <>
      <div className="border-b border-hairline bg-surface-raised px-6 py-3">
        <div className="mx-auto flex max-w-[190mm] flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-secondary">
            Shared read-only{access.label ? ` · ${access.label}` : ""}
          </p>
          <p className="text-xs text-tertiary">
            Prepared with{" "}
            <Link href="/" className="underline-offset-4 hover:text-secondary hover:underline">
              {brand.name}
            </Link>
          </p>
        </div>
      </div>
      {/* No horizontal padding on a phone: the document sheet carries its
          own, and two gutters leaves a column nobody can read. */}
      <div className="mx-auto max-w-[190mm] px-0 py-6 sm:px-6 sm:py-10">
        <PlanDocument doc={doc} />
      </div>
    </>
  );
}

function Unavailable({
  status,
}: {
  status: { status: "missing" | "revoked" } | { status: "expired"; expiredOn: string };
}) {
  const message =
    status.status === "revoked"
      ? "This link has been revoked by the person who shared it."
      : status.status === "expired"
        ? `This link expired on ${status.expiredOn}.`
        : "This link does not exist, or it was mistyped.";

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-display-sm">Not available</h1>
      <p className="mt-3 leading-relaxed text-secondary">{message}</p>
      <p className="mt-6 text-sm text-tertiary">
        Ask whoever sent it for a new link.
        <span aria-hidden className="mx-2">·</span>
        <Link href="/" className="underline-offset-4 hover:text-secondary hover:underline">
          {brand.name}
        </Link>
      </p>
    </main>
  );
}
