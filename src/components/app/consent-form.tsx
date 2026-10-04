"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function ConsentForm({
  clientName,
  clientUri,
  email,
  grants,
  staysConnected,
  known,
}: {
  clientName: string;
  clientUri: string | null;
  email: string;
  grants: string[];
  staysConnected: boolean;
  known: boolean;
}) {
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    setError(null);
    try {
      // The client plugin attaches the signed request from this page's query,
      // and the redirect plugin follows the answer back to the client — so a
      // success leaves the button pending while the browser navigates away.
      const result = await authClient.oauth2.consent({ accept });
      const next = result.data as { redirect?: boolean; url?: string } | null;
      if (next?.redirect && next.url) return;
      setError(result.error?.message ?? "That request could not be completed. Start again from the app.");
    } catch {
      setError("That request could not be completed. Start again from the app.");
    }
    setPending(null);
  }

  return (
    <div>
      <h1 className="text-display-sm">Connect {clientName}?</h1>
      <p className="mt-2.5 text-[0.95rem] leading-relaxed text-secondary">
        {clientName}
        {clientUri ? <> (<span className="break-all">{clientUri}</span>)</> : null} is asking to work
        with your plans as <span className="font-medium text-primary">{email}</span>.
        {known ? null : " It has not identified itself."} Only allow it if you started this.
      </p>

      <ul className="mt-8 space-y-3 border-t border-hairline pt-6">
        {grants.map((grant) => (
          <li key={grant} className="flex gap-3 text-sm leading-relaxed">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {grant}
          </li>
        ))}
        {staysConnected ? (
          <li className="flex gap-3 text-sm leading-relaxed">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            Stay connected until you disconnect it in Settings.
          </li>
        ) : null}
      </ul>

      <p className="mt-6 text-sm leading-relaxed text-tertiary">
        It cannot see your password, your payment details or anyone else&rsquo;s plans, and it
        cannot pay for an export.
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-sm border border-critical/40 bg-critical/5 px-3 py-2.5 text-sm text-critical">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex gap-3">
        <Button size="lg" className="flex-1" disabled={pending !== null} onClick={() => decide(true)}>
          {pending === "allow" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Allow
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          disabled={pending !== null}
          onClick={() => decide(false)}
        >
          {pending === "deny" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Deny
        </Button>
      </div>
    </div>
  );
}
