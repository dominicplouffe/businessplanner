import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "inverse";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium " +
  "transition-colors duration-150 ease-editorial disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-emerald-800 text-paper hover:bg-emerald-700",
  secondary: "border border-strong text-primary hover:bg-surface-sunken",
  ghost: "text-secondary hover:text-primary hover:bg-surface-sunken",
  inverse: "bg-paper text-ink-950 hover:bg-paper-200",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

type ButtonProps = {
  variant?: Variant;
  size?: Size;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ComponentProps<"button"> & ButtonProps) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ComponentProps<typeof Link> & ButtonProps) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
