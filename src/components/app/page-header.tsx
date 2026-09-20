import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";

export function AppPageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-hairline px-6 py-8 sm:px-10 sm:py-10", className)}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow ? <Eyebrow className="mb-4">{eyebrow}</Eyebrow> : null}
          <h1 className="text-display-sm sm:text-display-md">{title}</h1>
          {lede ? <p className="mt-3 leading-relaxed text-secondary">{lede}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
