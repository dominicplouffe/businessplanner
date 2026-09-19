"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqItem = { q: string; a: React.ReactNode };

export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-hairline border-y border-hairline">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={item.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-start justify-between gap-6 py-5 text-left"
            >
              <span className="font-display text-lg leading-snug text-primary">{item.q}</span>
              <span aria-hidden className="mt-1 shrink-0 text-tertiary">
                {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
              </span>
            </button>
            <div className={cn("overflow-hidden", isOpen ? "pb-6" : "hidden")}>
              <div className="max-w-2xl space-y-3 text-[0.95rem] leading-relaxed text-secondary">
                {item.a}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
