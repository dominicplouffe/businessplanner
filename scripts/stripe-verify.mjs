#!/usr/bin/env node
/* ==========================================================================
   Reconcile the Stripe catalogue against what the site says it charges.
   --------------------------------------------------------------------------
   Checkout names a Stripe price id rather than an amount, which is what makes
   the catalogue reportable — and it puts the number in two places. `pricing`
   in `src/lib/brand.ts` is what the marketing site and the entitlement copy
   render; the Stripe price is what the card is charged. Nothing in the app
   compares them, so without this they can disagree indefinitely and the first
   report is a customer's.

   Run it after changing a price on either side, and before a launch:

       node scripts/stripe-verify.mjs      (or: pnpm stripe:verify)

   Exits non-zero on any disagreement. No dependencies, for the same reason
   `deploy.mjs` has none: the person running it should not need a package
   manager first. The decisions live in `lib/stripe-catalog.mjs`, which is
   where the tests reach them.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_PRICES, pricingFromSource, problemsWith } from "./lib/stripe-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function env(name) {
  if (process.env[name]) return process.env[name];
  // Fall back to .env so this works from a clean shell, as the app does.
  try {
    for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key.trim().replace(/^export /, "").trim() === name) {
        return rest.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env is fine — the variable may simply be exported */
  }
  return "";
}

async function stripe(path) {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set, and no .env supplies one.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? `Stripe returned ${response.status}`);
  return body;
}

const note = (line) => process.stdout.write(`${line}\n`);
const problems = [];

const pricing = pricingFromSource(readFileSync(join(root, "src/lib/brand.ts"), "utf8"));
note("Reading amounts from src/lib/brand.ts and comparing against Stripe.\n");

for (const { env: name, pricingKey, interval } of EXPECTED_PRICES) {
  const id = env(name);
  if (!id) {
    problems.push(`${name} is not set.`);
    continue;
  }

  let price;
  try {
    price = await stripe(`prices/${id}`);
  } catch (error) {
    problems.push(`${name} (${id}): ${error.message}`);
    continue;
  }

  const shape = price.recurring ? `/${price.recurring.interval}` : "one-time";
  note(`  ${name}`);
  note(`    stripe    ${id}  ${price.unit_amount} ${price.currency} ${shape}  active=${price.active}`);
  note(`    brand.ts  pricing.${pricingKey}.price = ${pricing[pricingKey]}`);
  note("");

  problems.push(
    ...problemsWith({
      name,
      price,
      expectedDollars: pricing[pricingKey],
      expectedInterval: interval,
    }),
  );
}

if (problems.length > 0) {
  note(`✗ ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const problem of problems) note(`  · ${problem}`);
  note("");
  process.exit(1);
}

note("✓ Stripe and brand.ts agree.");
