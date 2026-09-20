"use client";

import { createAuthClient } from "better-auth/react";

/**
 * No baseURL: the client calls /api/auth on whatever origin the page was
 * served from. Pinning an absolute URL breaks the moment the host differs —
 * 127.0.0.1 versus localhost in development, or a preview domain in CI — and
 * the failure looks like a generic network error rather than a CORS one.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
