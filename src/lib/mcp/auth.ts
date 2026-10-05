import "server-only";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { auth, authIssuer, mcpResource, MCP_SCOPES } from "@/lib/auth";
import { db } from "@/lib/db";
import { internalOrigin } from "@/lib/env";
import { getOrCreateWorkspace } from "@/lib/session";
import type { McpCaller } from "./tools";

/* ==========================================================================
   Who is calling /mcp.
   --------------------------------------------------------------------------
   A bearer token from Venturelly's own authorization server, checked for this
   resource as its audience — a token issued for anything else, however valid,
   is refused. The person is the token's subject and the workspace is theirs,
   resolved exactly as a cookie session resolves it in the app.

   A failure is answered with the RFC 6750 / RFC 9728 challenge the library
   builds: a 401 whose WWW-Authenticate header points at this resource's
   metadata, which is how an MCP client discovers where to sign in.
   ========================================================================== */

const resourceClient = oauthProviderResourceClient(auth).getActions();

/* The signing keys, read from this same process over loopback. The library
   derives the address from `basePath`, which this config leaves at its
   default, and so asked for /jwks rather than /api/auth/jwks — every token
   failed with "Jwks failed: Not Found". Fetched once and cached by the
   library, then refetched when an unknown key id appears. */
const jwksUrl = `${internalOrigin}/api/auth/jwks`;

/** The discovery document /.well-known/oauth-protected-resource/mcp serves. */
export function protectedResourceMetadata() {
  return resourceClient.getProtectedResourceMetadata({
    resource: mcpResource,
    /* The issuer, not the origin. The library defaults to the base URL, but
       the issuer is at /api/auth, and a client fetches the authorization
       server's metadata from exactly the string named here — then refuses
       it if the document's `issuer` differs. */
    authorization_servers: [authIssuer],
    /* `offline_access` is advertised, not just permitted. A client requests
       what the resource metadata names, and the provider issues a refresh
       token only when that scope is in the request — so leaving it out meant
       every connection died an hour in with nothing to renew it, which is
       exactly what happened to the second and third clients that registered. */
    scopes_supported: [...MCP_SCOPES, "offline_access"],
    resource_name: "Venturelly",
    bearer_methods_supported: ["header"],
  });
}

export async function authenticate(request: Request): Promise<McpCaller | Response> {
  let payload: Record<string, unknown>;
  try {
    payload = (await resourceClient.verifyAccessTokenRequest(request, {
      verifyOptions: { audience: mcpResource, issuer: authIssuer },
      jwksUrl,
    })) as Record<string, unknown>;
  } catch (error) {
    return challengeResponse(error);
  }

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user) {
    // A client-credentials token has no person behind it, and a deleted
    // account's token outlives the account by its lifetime. Neither has a
    // workspace to act on.
    return Response.json({ error: "invalid_token", error_description: "This token names no current user." }, {
      status: 401,
    });
  }

  /* A live consent, not just a valid signature. Access tokens are JWTs that
     verify on their own for an hour; without this, disconnecting an app in
     Settings would leave its current token working until it expired. */
  const clientId = typeof payload.client_id === "string" ? payload.client_id : null;
  const consent = clientId
    ? await db.oauthConsent.findFirst({ where: { userId: user.id, clientId }, select: { id: true } })
    : null;
  if (!consent) {
    return Response.json(
      { error: "invalid_token", error_description: "This app has been disconnected. Connect it again to continue." },
      { status: 401, headers: { "WWW-Authenticate": `Bearer error="invalid_token"` } },
    );
  }

  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const scopes = new Set(String(payload.scope ?? "").split(/\s+/).filter(Boolean));
  if (!scopes.has("plans:read") && !scopes.has("plans:write")) {
    return Response.json(
      { error: "insufficient_scope", error_description: "Grant plans:read or plans:write." },
      { status: 403, headers: { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="plans:read plans:write"` } },
    );
  }
  // Writing implies reading; nobody grants one expecting the other refused.
  if (scopes.has("plans:write")) scopes.add("plans:read");

  return { userId: user.id, workspaceId: workspace.id, scopes };
}

type ChallengeError = { statusCode?: number; headers?: HeadersInit; body?: unknown };

function challengeResponse(error: unknown): Response {
  const e = (error ?? {}) as ChallengeError;
  if (typeof e.statusCode === "number") {
    return new Response(JSON.stringify(e.body ?? { error: "invalid_token" }), {
      status: e.statusCode,
      headers: { ...Object.fromEntries(new Headers(e.headers)), "Content-Type": "application/json" },
    });
  }
  throw error;
}
