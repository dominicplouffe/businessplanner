import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-md border border-hairline bg-surface-raised p-6 sm:p-7",
        className,
      )}
      {...props}
    />
  );
}
