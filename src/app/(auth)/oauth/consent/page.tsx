import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ConsentForm } from "@/components/app/consent-form";

export const metadata: Metadata = { title: "Connect an app" };

/* What each scope lets the client do, in the person's terms. Anything not
   listed here (openid, profile, email, offline_access) is about identity and
   staying connected, and is summarised in one line rather than itemised. */
const SCOPE_TEXT: Record<string, string> = {
  "plans:read": "Read your plans, their financial statements and their review.",
  "plans:write": "Create plans, answer intake questions and write sections on your behalf.",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const scopes = (typeof params.scope === "string" ? params.scope : "").split(/\s+/).filter(Boolean);

  const session = await getSession();
  if (!session?.user) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/sign-in?${query}`);
  }

  // Self-registered clients name themselves; the name is shown as theirs,
  // never as something Venturelly vouches for.
  const client = clientId
    ? await db.oauthClient.findUnique({ where: { clientId }, select: { name: true, uri: true } })
    : null;

  return (
    <ConsentForm
      clientName={client?.name || "An application"}
      clientUri={client?.uri ?? null}
      email={session.user.email}
      grants={scopes.filter((s) => SCOPE_TEXT[s]).map((s) => SCOPE_TEXT[s]!)}
      staysConnected={scopes.includes("offline_access")}
      known={Boolean(client)}
    />
  );
}
