import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { databaseKind, siteUrl } from "./env";

/**
 * Email and password only for now. OAuth providers and the organization plugin
 * (needed for advisory firms managing client plans) slot in here later without
 * touching call sites.
 */
export const auth = betterAuth({
  // Follows the database the adapter actually connected to, so the two
  // cannot disagree about which dialect is in use.
  database: prismaAdapter(db, { provider: databaseKind === "postgres" ? "postgresql" : "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? siteUrl,
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

  // Must be last: lets server actions set cookies on sign-in and sign-up.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
