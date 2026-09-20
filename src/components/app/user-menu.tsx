"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings, ChevronDown } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-surface-sunken"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-800 text-xs font-medium text-paper"
        >
          {initials || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-primary">{name}</span>
          <span className="block truncate text-xs text-tertiary">{email}</span>
        </span>
        <ChevronDown aria-hidden className={cn("size-3.5 text-tertiary transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-1 w-full rounded-md border border-hairline bg-surface-raised p-1 shadow-lg shadow-ink-950/10"
        >
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-secondary transition-colors hover:bg-surface-sunken hover:text-primary"
          >
            <Settings aria-hidden className="size-4" />
            Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await signOut();
              router.push("/");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-secondary transition-colors hover:bg-surface-sunken hover:text-primary"
          >
            <LogOut aria-hidden className="size-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
