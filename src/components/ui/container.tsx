import { cn } from "@/lib/utils";

/** The page's single horizontal rhythm. 16px gutters on phones by policy. */
export function Container({
  className,
  width = "default",
  ...props
}: React.ComponentProps<"div"> & { width?: "default" | "wide" | "prose" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        width === "default" && "max-w-6xl",
        width === "wide" && "max-w-7xl",
        width === "prose" && "max-w-2xl",
        className,
      )}
      {...props}
    />
  );
}
