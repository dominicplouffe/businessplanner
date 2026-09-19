import { cn } from "@/lib/utils";

/** Small caps label above a section heading. Brass tick included. */
export function Eyebrow({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 text-eyebrow font-medium uppercase text-tertiary",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="h-px w-6 bg-brass-500" />
      {children}
    </p>
  );
}
