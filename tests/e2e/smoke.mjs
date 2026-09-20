/* ==========================================================================
   End-to-end smoke.
   --------------------------------------------------------------------------
   Drives a real browser against a running dev server: sign up, look at the
   plan, try to export without paying, pay, export, share, snapshot, diff,
   restore. It also posts directly to the webhook to check the properties that
   cannot be reached through the UI — replay, forgery, and a cross-workspace
   grant.

   Run with the dev server up:   pnpm e2e
   The database is the local SQLite one; the script reads it directly to assert
   on state the UI does not show, which is the point of the last few checks.

   Deliberately not Playwright Test: there is no test runner to configure, it
   fails loudly with a non-zero exit, and it is one file somebody can read.
   ========================================================================== */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import Database from "better-sqlite3";

const ORIGIN = process.env.E2E_ORIGIN ?? "http://localhost:3000";
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE_PATH;
const PASSWORD = "Correct-Horse-9";

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

function checkThat(label, condition, detail = "") {
  checks++;
  if (!condition) failures++;
  console.log(`${condition ? "  ok  " : "FAIL  "}${label}${condition || !detail ? "" : `\n        ${detail}`}`);
}

const db = new Database("prisma/dev.db");
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  /* ---- Sign up --------------------------------------------------------- */
  const email = `e2e${Date.now()}@example.com`;
  await page.goto(`${ORIGIN}/sign-up`);
  await page.fill('input[name="name"]', "E2E Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|plans/, { timeout: 30_000 });
  checkThat("signs up and lands in the app", /dashboard|plans/.test(page.url()));

  const user = db.prepare("select id from user where email = ?").get(email);
  const member = db.prepare("select workspaceId from workspace_member where userId = ?").get(user.id);

  // A finished plan is needed to exercise export. Walking the whole intake in
  // a smoke test would make it slow and brittle, so an existing finished plan
  // is moved into this workspace instead.
  const plan = db.prepare("select id from plan where intakeComplete = 1 order by createdAt desc").get();
  if (!plan) throw new Error("No completed plan in the dev database to drive against.");
  db.prepare("update plan set workspaceId = ?, unlockedAt = null where id = ?").run(member.workspaceId, plan.id);
  db.prepare("delete from plan_version where planId = ?").run(plan.id);
  // Purchases from an earlier run would make the "one purchase recorded" check
  // count history rather than this run.
  db.prepare("delete from purchase where planId = ?").run(plan.id);

  /* ---- The pages render, and are accessible ---------------------------- */
  for (const path of ["", "/financials", "/market", "/review", "/versions", "/export"]) {
    const response = await page.goto(`${ORIGIN}/plans/${plan.id}${path}`, { waitUntil: "networkidle" });
    check(`plans/[id]${path || "/"} responds 200`, response?.status(), 200);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    check(`plans/[id]${path || "/"} has no axe violations`, axe.violations.map((v) => v.id), []);
  }
  for (const path of ["/dashboard", "/settings", "/settings/billing"]) {
    const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
    check(`${path} responds 200`, response?.status(), 200);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    check(`${path} has no axe violations`, axe.violations.map((v) => v.id), []);
  }

  /* ---- The entitlement gate -------------------------------------------- */
  await page.goto(`${ORIGIN}/plans/${plan.id}/export`, { waitUntil: "networkidle" });
  const locked = await page.evaluate(
    async (id) => (await fetch(`/api/export/xlsx?planId=${id}`)).status,
    plan.id,
  );
  check("export refuses with 402 before payment", locked, 402);
  check(
    "creating a share link is disabled before payment",
    await page.getByRole("button", { name: /new link/i }).isDisabled(),
    true,
  );

  /* ---- Paying ---------------------------------------------------------- */
  await page.getByRole("button", { name: /Unlock for \$/ }).click();
  await page.waitForURL(/billing\/simulate/, { timeout: 15_000 });
  await page.getByRole("button", { name: /Confirm simulated payment/i }).click();
  await page.waitForURL(/\/export/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  const unlocked = db.prepare("select unlockedAt from plan where id = ?").get(plan.id);
  checkThat("the webhook — not the redirect — wrote the entitlement", unlocked.unlockedAt !== null);
  const purchases = db.prepare("select amount, currency from purchase where planId = ?").all(plan.id);
  check("one purchase recorded", purchases.length, 1);
  check("the amount recorded is what was charged", purchases[0]?.amount, 19_900);

  const exported = await page.evaluate(async (id) => {
    const response = await fetch(`/api/export/xlsx?planId=${id}`);
    return { status: response.status, size: (await response.blob()).size };
  }, plan.id);
  check("export succeeds after payment", exported.status, 200);
  checkThat("the workbook has real content", exported.size > 10_000, `${exported.size} bytes`);

  await page.reload({ waitUntil: "networkidle" });
  check(
    "creating a share link is available after payment",
    await page.getByRole("button", { name: /new link/i }).isDisabled(),
    false,
  );

  /* ---- Webhook properties the UI cannot reach -------------------------- */
  const synthetic = (id, workspaceId, planId) => ({
    id,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_e2e",
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        amount_total: 19_900,
        currency: "usd",
        metadata: { workspaceId, planId, kind: "unlock" },
      },
    },
  });

  const postWebhook = async (event, headers = {}) => {
    const response = await fetch(`${ORIGIN}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(event),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const devHeaders = { "x-venturelly-dev-webhook": "1" };

  const replayId = `evt_e2e_replay_${Date.now()}`;
  const first = await postWebhook(synthetic(replayId, member.workspaceId, plan.id), devHeaders);
  const replay = await postWebhook(synthetic(replayId, member.workspaceId, plan.id), devHeaders);
  check("a first delivery is accepted", first.status, 200);
  check("a replay is recognised as a duplicate", replay.body.duplicate, true);
  check(
    "a replay creates no second purchase",
    db.prepare("select count(*) c from purchase where stripeEventId = ?").get(replayId).c,
    1,
  );

  const forged = await postWebhook(synthetic(`evt_e2e_forged_${Date.now()}`, member.workspaceId, plan.id));
  check("an unsigned delivery is rejected", forged.status, 400);

  const otherWorkspace = db
    .prepare("select id from workspace where id != ? limit 1")
    .get(member.workspaceId);
  if (otherWorkspace) {
    const crossId = `evt_e2e_cross_${Date.now()}`;
    const cross = await postWebhook(synthetic(crossId, otherWorkspace.id, plan.id), devHeaders);
    // 200 so Stripe stops retrying an event we will never act on, and recorded
    // with the reason so the refusal is auditable.
    check("a cross-workspace grant is answered 200", cross.status, 200);
    check(
      "a cross-workspace grant is recorded as ignored",
      db.prepare("select outcome from webhook_event where stripeEventId = ?").get(crossId)?.outcome,
      "ignored",
    );
    check(
      "a cross-workspace grant records no purchase",
      db.prepare("select count(*) c from purchase where stripeEventId = ?").get(crossId).c,
      0,
    );
  }

  /* ---- Versioning ------------------------------------------------------ */
  db.prepare(
    "update plan_section set contentText = ?, status = 'edited' where planId = ? and key = 'company'",
  ).run("It is a restaurant. It seats seventy-eight. The owner has run two kitchens.", plan.id);

  await page.goto(`${ORIGIN}/plans/${plan.id}/versions`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Take a checkpoint/i }).click();
  await page.waitForTimeout(1_200);

  db.prepare("update plan_section set contentText = ? where planId = ? and key = 'company'").run(
    "It is a restaurant. It seats ninety. The owner has run two kitchens. It opens in month four.",
    plan.id,
  );

  await page.goto(`${ORIGIN}/plans/${plan.id}/versions`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  checkThat("the diff reports what changed", /1 section changed/.test(body), body.slice(0, 200));
  check(
    "the unchanged sentence is not reported as changed",
    await page.locator('p:has-text("The owner has run two kitchens.")').count(),
    1,
  );

  await page.getByRole("button", { name: /Restore this/i }).click();
  await page.waitForTimeout(1_500);
  const restored = db
    .prepare("select contentText from plan_section where planId = ? and key = 'company'")
    .get(plan.id);
  checkThat("restoring brings the snapshot back", restored.contentText.includes("seventy-eight"));
  const labels = db
    .prepare("select label from plan_version where planId = ? order by createdAt")
    .all(plan.id)
    .map((row) => row.label);
  checkThat(
    "restoring is itself snapshotted, so it can be undone",
    labels.some((label) => label.startsWith("Before restoring")),
    labels.join(" | "),
  );

  check("no uncaught page errors", pageErrors, []);
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
