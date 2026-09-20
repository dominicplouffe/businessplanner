import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionEditor } from "@/components/app/section-editor";
import { Eyebrow } from "@/components/ui/eyebrow";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, PLAN_SECTIONS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Section" };

export default async function SectionPage({
  params,
}: {
  params: Promise<{ planId: string; sectionKey: string }>;
}) {
  const { planId, sectionKey } = await params;
  const user = await requireUser(`/plans/${planId}/sections/${sectionKey}`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const index = PLAN_SECTIONS.findIndex((s) => s.key === sectionKey);
  if (index === -1) notFound();
  const meta = PLAN_SECTIONS[index]!;
  const stored = plan.sections.find((s) => s.key === sectionKey);

  const previous = index > 0 ? PLAN_SECTIONS[index - 1] : null;
  const next = index < PLAN_SECTIONS.length - 1 ? PLAN_SECTIONS[index + 1] : null;

  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Section rail */}
      <nav aria-label="Plan sections" className="border-b border-hairline px-4 py-5 lg:border-b-0 lg:border-r">
        <Link
          href={`/plans/${plan.id}`}
          className="mb-4 flex items-center gap-1.5 px-2 text-sm text-secondary hover:text-primary"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
          {plan.companyName || plan.title}
        </Link>
        <ol className="space-y-0.5">
          {PLAN_SECTIONS.map((section, i) => {
            const sectionState = plan.sections.find((s) => s.key === section.key);
            const written = (sectionState?.contentText.trim().length ?? 0) > 0;
            const active = section.key === sectionKey;
            return (
              <li key={section.key}>
                <Link
                  href={`/plans/${plan.id}/sections/${section.key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-surface-sunken font-medium text-primary"
                      : "text-secondary hover:bg-surface-sunken hover:text-primary",
                  )}
                >
                  <span className="numeric text-xs text-marker">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{section.title}</span>
                  <span
                    aria-label={written ? "Written" : "Not written"}
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      written ? "bg-emerald-600" : "bg-ink-300",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 px-6 py-8 sm:px-10">
        <Eyebrow className="mb-4">{`Section ${index + 1} of ${PLAN_SECTIONS.length}`}</Eyebrow>
        <h1 className="text-display-sm sm:text-display-md">{meta.title}</h1>

        <div className="mt-8 max-w-3xl">
          <SectionEditor
            key={sectionKey}
            planId={plan.id}
            sectionKey={sectionKey}
            sectionTitle={meta.title}
            initialText={stored?.contentText ?? ""}
          />
        </div>

        <nav aria-label="Section navigation" className="mt-12 flex items-center justify-between gap-4 border-t border-hairline pt-6">
          {previous ? (
            <Link
              href={`/plans/${plan.id}/sections/${previous.key}`}
              className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
            >
              <ChevronLeft aria-hidden className="size-3.5" />
              {previous.title}
            </Link>
          ) : <span />}
          {next ? (
            <Link
              href={`/plans/${plan.id}/sections/${next.key}`}
              className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary"
            >
              {next.title}
              <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          ) : <span />}
        </nav>
      </div>
    </div>
  );
}
