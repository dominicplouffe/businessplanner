import Link from "next/link";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Wordmark. The brass diamond is the one decorative element in the identity. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-baseline gap-2", className)}
      aria-label={`${brand.name} home`}
    >
      <span aria-hidden className="relative top-[-0.15em] size-2 rotate-45 bg-brass-500" />
      <span className="font-display text-xl tracking-[-0.02em]">{brand.name}</span>
    </Link>
  );
}
