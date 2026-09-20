import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

/**
 * Email and password only for now. OAuth providers and the organization plugin
 * (needed for advisory firms managing client plans) slot in here later without
 * touching call sites.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "sqlite" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  // Development is reached on both hostnames; production uses the real origin.
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.NEXT_PUBLIC_SITE_URL ? [process.env.NEXT_PUBLIC_SITE_URL] : []),
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
