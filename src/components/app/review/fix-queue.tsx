import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QueueItem } from "@/lib/review/queue";

/* ==========================================================================
   The fix-it queue.
   --------------------------------------------------------------------------
   Ranked, each item carrying what is wrong, what to change and where to change
   it. Severity is carried by the heading it sits under and by an icon, not by
   colour: the two groups are separately labelled sections, so the distinction
   survives greyscale, a printout and protanopia alike.
   ========================================================================== */

export function FixQueue({ items }: { items: QueueItem[] }) {
  const blocking = items.filter((i) => i.severity === "blocking");
  const advisory = items.filter((i) => i.severity === "warning");

  return (
    <section aria-labelledby="queue">
      <h2 id="queue" className="font-display text-xl">
        What to fix
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
        {items.length === 0
          ? "Nothing outstanding."
          : `${items.length} item${items.length === 1 ? "" : "s"}, hardest first. ${
              blocking.length === 0
                ? "None of them blocks export."
                : `${blocking.length} of them block export.`
            }`}
      </p>

      {items.length === 0 ? (
        <p className="mt-6 flex items-center gap-2 rounded-lg border border-hairline px-5 py-4 text-sm text-good">
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          Nothing here would send this plan back. That is rare — worth a second
          read of the assumptions before you take it as settled.
        </p>
      ) : (
        <div className="mt-6 space-y-9">
          <Group
            heading="Blocking"
            caption="Export stays locked until these are resolved."
            items={blocking}
            tone="critical"
          />
          <Group
            heading="Worth a look"
            caption="These may be perfectly defensible — but a reader will ask."
            items={advisory}
            tone="warning"
          />
        </div>
      )}
    </section>
  );
}

function Group({
  heading,
  caption,
  items,
  tone,
}: {
  heading: string;
  caption: string;
  items: QueueItem[];
  tone: "critical" | "warning";
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={`queue-${heading}`}>
      <div className="flex items-baseline gap-3">
        <h3
          id={`queue-${heading}`}
          className={cn(
            "text-eyebrow font-medium uppercase",
            tone === "critical" ? "text-critical" : "text-warning",
          )}
        >
          {heading}
        </h3>
        <span className="numeric text-xs text-tertiary">{items.length}</span>
      </div>
      <p className="mt-1 text-sm text-tertiary">{caption}</p>

      <ol className="mt-4 divide-y divide-hairline border-t border-hairline">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-4">
            {item.source === "consistency" ? (
              <ScanLine
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", tone === "critical" ? "text-critical" : "text-warning")}
              />
            ) : (
              <AlertTriangle
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", tone === "critical" ? "text-critical" : "text-warning")}
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">{item.detail}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-tertiary">{item.remedy}</p>

              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-500"
                >
                  Go and fix it
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
