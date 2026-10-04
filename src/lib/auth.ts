import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "./db";
import { siteUrl } from "./env";

const baseURL = process.env.BETTER_AUTH_URL ?? siteUrl;

/** The authorization server's issuer identifier. It has a path, and RFC 8414
 *  requires it to match exactly wherever it is named. */
export const authIssuer = `${baseURL}/api/auth`;

/** The MCP endpoint, as the audience its access tokens are issued for. */
export const mcpResource = `${siteUrl}/mcp`;

/** What an MCP client can be granted. Reading never needs the second. */
export const MCP_SCOPES = ["plans:read", "plans:write"] as const;

/**
 * Email and password only for now. OAuth providers and the organization plugin
 * (needed for advisory firms managing client plans) slot in here later without
 * touching call sites.
 */
export const auth = betterAuth({
  /* "sqlite" on both databases, deliberately. The provider tells the adapter
     how to encode lists, and the schema stores every list as JSON text so
     that one schema runs on both (see the header of schema.prisma). Told
     "postgresql", the adapter hands Prisma a native array for the OAuth
     tables' scope and redirect-URI columns — which works on SQLite, so it
     would pass every local test and fail the first client registration in
     production. The only other thing the provider changes is
     case-insensitive matching, which SQLite does not have either, so
     production now behaves exactly like development. */
  database: prismaAdapter(db, { provider: "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  // Development is reached on both hostnames; production uses the real origin.
  trustedOrigins: [
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://127.0.0.1:3000"]),
    siteUrl,
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Verification email delivery arrives with the email layer; until then an
    // unverified account is still usable, so nobody is locked out of a demo.
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {},
  },

  /* The JWT plugin's own /token endpoint would sit beside the OAuth token
     endpoint and issue a token for any session, with no client or consent
     behind it. The keys are what the OAuth provider needs from it. */
  disabledPaths: ["/token"],

  plugins: [
    // Signs the access tokens /mcp verifies, and publishes the keys at /jwks.
    jwt(),
    /* Venturelly as an OAuth 2.1 authorization server, for the MCP endpoint.

       Registration is open because that is how MCP clients arrive: Claude,
       an IDE, a script — none of them is known in advance, and each registers
       itself (RFC 7591) as a public client using PKCE. Open registration is
       safe for the same reason it is normal: a registered client can do
       nothing until a signed-in person approves it on the consent page, and
       the token it then gets is scoped to that person's workspace. */
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      scopes: ["openid", "profile", "email", "offline_access", ...MCP_SCOPES],
      resources: [{ identifier: mcpResource, allowedScopes: [...MCP_SCOPES] }],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // A self-registered client exists to reach /mcp, and only /mcp.
      clientRegistrationDefaultResources: [mcpResource],
    }),
    // Must be last: lets server actions set cookies on sign-in and sign-up.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
