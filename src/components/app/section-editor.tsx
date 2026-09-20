"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { saveSectionAction, revertPlanAction } from "@/lib/actions/section-actions";
import { cn } from "@/lib/utils";

type Status = "idle" | "generating" | "saving" | "saved" | "error";

export function SectionEditor({
  planId,
  sectionKey,
  sectionTitle,
  initialText,
}: {
  planId: string;
  sectionKey: string;
  sectionTitle: string;
  initialText: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generator, setGenerator] = useState<string | null>(null);
  const [showInstruction, setShowInstruction] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [dirty, setDirty] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // No effect resets state when the section changes: the parent keys this
  // component by sectionKey, so it remounts and useState is simply correct.
  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(
    async (withInstruction?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("generating");
      setError(null);
      setStatusMessage(null);
      setText("");
      setDirty(false);

      try {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            sectionKey,
            ...(withInstruction ? { instruction: withInstruction } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? `Request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        // Minimal SSE parser: events are separated by a blank line.
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let split: number;
          while ((split = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);

            const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.slice(7).trim();
            const data = JSON.parse(dataLine.slice(6)) as Record<string, string>;

            if (event === "meta") setGenerator(data.generator ?? null);
            else if (event === "status") setStatusMessage(data.message ?? null);
            else if (event === "delta") {
              accumulated += data.text ?? "";
              setText(accumulated);
            } else if (event === "done") {
              setText(data.text ?? accumulated);
              setStatus("saved");
              setStatusMessage(null);
              setDirty(false);
              router.refresh();
            } else if (event === "error") {
              setError(data.message ?? "Generation failed.");
              setStatus("error");
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Generation failed.");
        setStatus("error");
      }
    },
    [planId, sectionKey, router],
  );

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      await saveSectionAction({ planId, sectionKey, text });
      setStatus("saved");
      setDirty(false);
      router.refresh();
    } catch {
      setError("Could not save.");
      setStatus("error");
    }
  }, [planId, sectionKey, text, router]);

  const revert = useCallback(async () => {
    const result = await revertPlanAction(planId);
    if (!result.ok) setError(result.reason);
    else router.refresh();
  }, [planId, router]);

  const isEmpty = text.trim().length === 0;
  const isBusy = status === "generating" || status === "saving";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void generate()}
            disabled={isBusy}
          >
            {status === "generating" ? (
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
            ) : isEmpty ? (
              <Sparkles aria-hidden className="size-3.5" />
            ) : (
              <RefreshCw aria-hidden className="size-3.5" />
            )}
            {status === "generating" ? "Writing…" : isEmpty ? "Write this section" : "Regenerate"}
          </Button>

          {!isEmpty ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setShowInstruction(!showInstruction)}
              disabled={isBusy}
              aria-expanded={showInstruction}
            >
              Regenerate with a note
            </Button>
          ) : null}

          <Button type="button" size="sm" variant="ghost" onClick={() => void revert()} disabled={isBusy}>
            <Undo2 aria-hidden className="size-3.5" />
            Undo last change
          </Button>
        </div>

        <p aria-live="polite" className="text-xs text-tertiary">
          {statusMessage
            ? statusMessage
            : status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved"
                : dirty
                  ? "Unsaved changes"
                  : ""}
        </p>
      </div>

      {showInstruction ? (
        <div className="mt-4 rounded-md border border-hairline bg-surface-sunken p-4">
          <label htmlFor="instruction" className="block text-sm font-medium text-primary">
            What should change?
          </label>
          <Textarea
            id="instruction"
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Shorter, and lead with the funding request rather than the history."
            className="mt-2"
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setShowInstruction(false);
                void generate(instruction.trim() || undefined);
              }}
              disabled={isBusy}
            >
              Rewrite
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowInstruction(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-sm border border-critical/40 bg-critical/5 px-3 py-2.5 text-sm text-critical">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        {isEmpty && status !== "generating" ? (
          <div className="rounded-lg border border-dashed border-strong p-10 text-center">
            <p className="font-display text-xl">{sectionTitle} has not been written yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-secondary">
              It will be written against the financial model, using the figures the
              engine computed — not numbers invented to fit the prose.
            </p>
          </div>
        ) : (
          <>
            <label htmlFor="section-body" className="sr-only">
              {sectionTitle}
            </label>
            <Textarea
              id="section-body"
              value={text}
              rows={20}
              readOnly={status === "generating"}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
                setStatus("idle");
              }}
              className={cn(
                "min-h-[28rem] font-sans text-[0.975rem] leading-[1.75]",
                status === "generating" && "text-secondary",
              )}
            />
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-tertiary">
                {generator === "fixture"
                  ? "Composed from the model — set ANTHROPIC_API_KEY to write with Claude."
                  : generator === "anthropic"
                    ? "Written by Claude against the computed model."
                    : ""}
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={() => void save()} disabled={isBusy}>
                Save changes
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
