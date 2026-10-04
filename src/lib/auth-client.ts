"use client";

import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/**
 * No baseURL: the client calls /api/auth on whatever origin the page was
 * served from. Pinning an absolute URL breaks the moment the host differs —
 * 127.0.0.1 versus localhost in development, or a preview domain in CI — and
 * the failure looks like a generic network error rather than a CORS one.
 */
export const authClient = createAuthClient({
  /* Attaches the signed OAuth request in the page's query to sign-in, sign-up
     and consent calls, which is how the server resumes an MCP client's
     authorisation after the person signs in. A no-op on any other page. */
  plugins: [oauthProviderClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
