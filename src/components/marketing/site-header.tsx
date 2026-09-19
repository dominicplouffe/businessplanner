"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { productNav, resourcesNav, solutionsNav, type NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

const menus: { label: string; links: NavLink[] }[] = [
  { label: "Product", links: productNav },
  { label: "Solutions", links: solutionsNav },
  { label: "Resources", links: resourcesNav },
];

export function SiteHeader() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Escape closes whichever layer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-surface/85 backdrop-blur-md">
      <Container width="wide">
        <div className="flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Logo />

            <nav aria-label="Main" className="hidden lg:block">
              <ul className="flex items-center gap-1" onMouseLeave={() => setOpen(null)}>
                {menus.map((menu) => (
                  <li key={menu.label} className="relative">
                    <button
                      type="button"
                      aria-expanded={open === menu.label}
                      onMouseEnter={() => setOpen(menu.label)}
                      onClick={() => setOpen(open === menu.label ? null : menu.label)}
                      className={cn(
                        "flex items-center gap-1 rounded-sm px-3 py-2 text-sm transition-colors",
                        open === menu.label ? "text-primary" : "text-secondary hover:text-primary",
                      )}
                    >
                      {menu.label}
                      <ChevronDown aria-hidden className="size-3.5 opacity-60" />
                    </button>

                    {open === menu.label ? (
                      <div className="absolute left-0 top-full w-[26rem] pt-2">
                        <div className="rounded-md border border-hairline bg-surface-raised p-2 shadow-lg shadow-ink-950/5">
                          <ul>
                            {menu.links.map((link) => (
                              <li key={link.href}>
                                <Link
                                  href={link.href}
                                  onClick={() => setOpen(null)}
                                  className="block rounded-sm px-3 py-2.5 transition-colors hover:bg-surface-sunken"
                                >
                                  <span className="text-sm font-medium text-primary">{link.label}</span>
                                  {link.blurb ? (
                                    <span className="mt-0.5 block text-sm leading-snug text-tertiary">
                                      {link.blurb}
                                    </span>
                                  ) : null}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
                <li>
                  <Link
                    href="/pricing"
                    className="rounded-sm px-3 py-2 text-sm text-secondary transition-colors hover:text-primary"
                  >
                    Pricing
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <ButtonLink href="/sign-in" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/sign-up" size="sm">
              Start a plan
            </ButtonLink>
          </div>

          <button
            type="button"
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-sm text-secondary lg:hidden"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </Container>

      {mobileOpen ? (
        <div className="border-t border-hairline bg-surface lg:hidden">
          <Container className="py-6">
            <nav aria-label="Main (mobile)" className="space-y-7">
              {menus.map((menu) => (
                <div key={menu.label}>
                  <p className="text-eyebrow font-medium uppercase text-tertiary">{menu.label}</p>
                  <ul className="mt-3 space-y-1">
                    {menu.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={() => setMobileOpen(false)}
                          className="block py-2 text-[0.95rem] text-secondary"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="mt-8 flex flex-col gap-2">
              <ButtonLink href="/sign-up" size="lg">
                Start a plan
              </ButtonLink>
              <ButtonLink href="/sign-in" variant="secondary" size="lg">
                Sign in
              </ButtonLink>
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
