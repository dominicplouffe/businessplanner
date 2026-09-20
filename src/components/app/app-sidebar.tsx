"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Cpu, FileText, LayoutDashboard, LineChart, Plus, Target } from "lucide-react";
import { Logo } from "@/components/marketing/logo";
import { UserMenu } from "./user-menu";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlanLink = { id: string; title: string };

export function AppSidebar({
  user,
  plans,
}: {
  user: { name: string; email: string };
  plans: PlanLink[];
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <Logo href="/dashboard" />
      </div>

      <ButtonLink href="/plans/new" size="sm" className="w-full">
        <Plus aria-hidden className="size-3.5" />
        New plan
      </ButtonLink>

      <nav aria-label="Workspace" className="flex-1 overflow-y-auto">
        <NavItem
          href="/dashboard"
          icon={<LayoutDashboard aria-hidden className="size-4" />}
          active={pathname === "/dashboard"}
        >
          Dashboard
        </NavItem>

        {plans.length > 0 ? (
          <div className="mt-6">
            <p className="px-2.5 text-eyebrow font-medium uppercase text-tertiary">Plans</p>
            <ul className="mt-2 space-y-0.5">
              {plans.map((plan) => {
                const open = pathname.startsWith(`/plans/${plan.id}`);
                return (
                  <li key={plan.id}>
                    <NavItem
                      href={`/plans/${plan.id}`}
                      icon={<FileText aria-hidden className="size-4" />}
                      active={pathname === `/plans/${plan.id}`}
                    >
                      {plan.title}
                    </NavItem>

                    {/* The workspace only appears under the plan you are in,
                        so the rail stays short with a dozen plans in it. */}
                    {open ? (
                      <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-hairline pl-2">
                        <li>
                          <NavItem
                            href={`/plans/${plan.id}/financials`}
                            icon={<LineChart aria-hidden className="size-4" />}
                            active={pathname === `/plans/${plan.id}/financials`}
                          >
                            Financials
                          </NavItem>
                        </li>
                        <li>
                          <NavItem
                            href={`/plans/${plan.id}/market`}
                            icon={<Target aria-hidden className="size-4" />}
                            active={pathname === `/plans/${plan.id}/market`}
                          >
                            Market
                          </NavItem>
                        </li>
                        <li>
                          <NavItem
                            href={`/plans/${plan.id}/resilience`}
                            icon={<Cpu aria-hidden className="size-4" />}
                            active={pathname === `/plans/${plan.id}/resilience`}
                          >
                            AI disruption
                          </NavItem>
                        </li>
                        <li>
                          <NavItem
                            href={`/plans/${plan.id}/review`}
                            icon={<ClipboardCheck aria-hidden className="size-4" />}
                            active={pathname === `/plans/${plan.id}/review`}
                          >
                            Review
                          </NavItem>
                        </li>
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-hairline pt-3">
        <UserMenu name={user.name} email={user.email} />
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors",
        active ? "bg-surface-sunken font-medium text-primary" : "text-secondary hover:bg-surface-sunken hover:text-primary",
      )}
    >
      <span className="shrink-0 text-tertiary">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
