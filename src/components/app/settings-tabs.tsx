"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/* The rail rendered both tabs identically, with no `aria-current` and no
   knowledge of the route — so neither a sighted reader nor a screen reader
   could tell which page they were on. */

export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="border-b border-hairline">
      <ul className="flex gap-6">
        {tabs.map((tab) => {
          // Exact match: /settings is a prefix of /settings/billing, so
          // `startsWith` would mark both as current on the billing page.
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 pb-3 text-sm transition-colors",
                  current
                    ? "border-ink-950 font-medium text-primary"
                    : "border-transparent text-secondary hover:border-strong hover:text-primary",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
