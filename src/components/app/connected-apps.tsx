"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { disconnectAppAction } from "@/lib/actions/connected-app-actions";
import { Button } from "@/components/ui/button";

export type ConnectedApp = {
  clientId: string;
  name: string;
  scopes: string;
  connectedOn: string;
};

export function ConnectedApps({ apps }: { apps: ConnectedApp[] }) {
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);

  if (apps.length === 0) {
    return <p className="mt-5 text-sm text-tertiary">No apps are connected.</p>;
  }

  return (
    <ul className="mt-5 divide-y divide-hairline border-y border-hairline">
      {apps.map((app) => (
        <li key={app.clientId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
          <div>
            <p className="text-sm text-primary">{app.name}</p>
            <p className="mt-0.5 text-xs text-tertiary">
              {app.scopes} · connected {app.connectedOn}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setWorking(app.clientId);
              startTransition(async () => {
                await disconnectAppAction({ clientId: app.clientId });
                setWorking(null);
              });
            }}
          >
            {working === app.clientId ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Disconnect
          </Button>
        </li>
      ))}
    </ul>
  );
}
