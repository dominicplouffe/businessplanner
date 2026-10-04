/* ==========================================================================
   End-to-end: connecting an MCP client.
   --------------------------------------------------------------------------
   Plays both parts of the connection a client like Claude makes. The client
   half is plain HTTP — discovery from the 401, dynamic registration, PKCE,
   the token exchange, MCP calls. The person's half is a real browser: signing
   in mid-flow, signing up mid-flow, and the consent page's two buttons.

   Run with the dev server up:   pnpm e2e:mcp
   Start the server without ANTHROPIC_API_KEY, or the generation check spends
   real money on a live model.

   Same shape as smoke.mjs: no runner, one file, a non-zero exit on failure.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const ORIGIN = process.env.E2E_ORIGIN ?? "http://localhost:3000";
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE_PATH;
const PASSWORD = "Correct-Horse-9";
// Never listened on: the browser's arrival there is intercepted below, which
// is what a CLI client's local callback server would receive.
const REDIRECT = "http://127.0.0.1:53682/callback";

let failures = 0;
let checks = 0;

function checkThat(label, condition, detail = "") {
  checks++;
  if (!condition) failures++;
  console.log(`${condition ? "  ok  " : "FAIL  "}${label}${condition || !detail ? "" : `\n        ${detail}`}`);
}

/* ---- The client's half -------------------------------------------------- */

async function discover() {
  const res = await fetch(`${ORIGIN}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const pointer = /resource_metadata="([^"]+)"/.exec(res.headers.get("www-authenticate") ?? "")?.[1];
  checkThat("an unauthenticated call is challenged with a metadata pointer", res.status === 401 && Boolean(pointer));
  const resource = await (await fetch(pointer)).json();
  const issuer = new URL(resource.authorization_servers[0]);
  const server = await (await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`)).json();
  checkThat("the authorization server's metadata names the issuer it was found at", server.issuer === issuer.href);
  return { resource, server };
}

async function register(server) {
  // As a CLI client sends it: a loopback redirect and no application_type.
  const res = await fetch(server.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "E2E Client", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
  });
  const client = await res.json();
  checkThat("a loopback client registers without declaring itself native", Boolean(client.client_id), JSON.stringify(client));
  return client;
}

function authorizeUrl(server, resource, client, scope) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(8).toString("hex");
  const url = new URL(server.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, scope, state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", resource: resource.resource,
  })) url.searchParams.set(k, v);
  return { url: url.href, verifier, state };
}

async function exchange(server, resource, client, code, verifier) {
  const res = await fetch(server.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier, resource: resource.resource }),
  });
  return res.json();
}

async function callTool(token, name, args) {
  const res = await fetch(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const { result } = await res.json();
  const text = result.content.map((c) => c.text).join("\n");
  let json = null;
  try { json = JSON.parse(text); } catch { /* an error message, not JSON */ }
  return { isError: Boolean(result.isError), text, json };
}

/* ---- The person's half -------------------------------------------------- */

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route(`${REDIRECT}**`, (route) => route.fulfill({ status: 200, body: "callback received" }));

/** Follows the browser to the client's callback and reads what arrived. */
async function arrival() {
  await page.waitForURL((u) => u.href.startsWith(REDIRECT), { timeout: 30_000 });
  return new URL(page.url()).searchParams;
}

try {
  const { resource, server } = await discover();
  const client = await register(server);

  /* ---- Signing up in the middle of a connection ------------------------- */
  const email = `mcp${Date.now()}@example.com`;
  let flow = authorizeUrl(server, resource, client, "plans:read plans:write offline_access");
  await page.goto(flow.url);
  await page.waitForURL(/\/sign-in\?/);
  checkThat("a signed-out person is sent to sign in, with the request attached", page.url().includes("sig="));

  await page.click('a:has-text("Create one")');
  await page.waitForURL(/\/sign-up\?/);
  checkThat("the link to sign up keeps the signed request", page.url().includes("sig="));

  await page.fill('input[name="name"]', "MCP Tester");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/oauth\/consent\?/, { timeout: 30_000 });
  checkThat("after signing up, the connection continues to consent", true);

  const heading = await page.locator("h1").textContent();
  checkThat("consent names the client", heading?.includes("E2E Client"), heading ?? "");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  checkThat("consent page has no WCAG A/AA violations", axe.violations.length === 0, axe.violations.map((v) => v.id).join(", "));
  await page.screenshot({ path: "test-results/mcp-consent.png" }).catch(() => {});

  await page.click('button:has-text("Allow")');
  let params = await arrival();
  checkThat("Allow returns a code and the client's own state", Boolean(params.get("code")) && params.get("state") === flow.state);

  const tokens = await exchange(server, resource, client, params.get("code"), flow.verifier);
  checkThat("the code exchanges for an access token", Boolean(tokens.access_token), JSON.stringify(tokens));

  const created = await callTool(tokens.access_token, "create_plan", {
    title: "Harbour Bakery", industry: "restaurant",
    answers: { "company.name": "Harbour Bakery", "context.description": "A neighbourhood bakery and cafe." },
  });
  checkThat("create_plan works with the token", !created.isError && Boolean(created.json?.planId), created.text);

  await page.goto(`${ORIGIN}/dashboard`);
  checkThat("the plan created over MCP is in the person's dashboard", (await page.content()).includes("Harbour Bakery"));

  /* ---- Signing in to a client already approved ------------------------- */
  await context.clearCookies();
  flow = authorizeUrl(server, resource, client, "plans:read");
  await page.goto(flow.url);
  await page.waitForURL(/\/sign-in\?/);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Consent is remembered per client and scope: this client was granted more
  // than it is asking for now, so the person is not asked again.
  params = await arrival();
  checkThat("after signing in, an approved client gets its code without asking again", Boolean(params.get("code")) && params.get("state") === flow.state);

  /* ---- A new client, denied --------------------------------------------- */
  const second = await register(server);
  flow = authorizeUrl(server, resource, second, "plans:read plans:write");
  await page.goto(flow.url);
  await page.waitForURL(/\/oauth\/consent\?/);
  checkThat("a client nobody has approved is asked about", true);
  await page.click('button:has-text("Deny")');
  params = await arrival();
  checkThat("Deny returns access_denied and no code", params.get("error") === "access_denied" && !params.get("code"));

  /* ---- A read-only grant ------------------------------------------------- */
  const third = await register(server);
  flow = authorizeUrl(server, resource, third, "plans:read");
  await page.goto(flow.url);
  await page.waitForURL(/\/oauth\/consent\?/);
  await page.click('button:has-text("Allow")');
  params = await arrival();
  const readOnly = await exchange(server, resource, third, params.get("code"), flow.verifier);
  const listed = await callTool(readOnly.access_token, "list_plans", {});
  checkThat("a read-only token can read", !listed.isError && listed.json?.length === 1);
  const refused = await callTool(readOnly.access_token, "create_plan", { title: "Nope", industry: "retail" });
  checkThat("a read-only token cannot write", refused.isError && refused.text.includes("read access only"));

  /* ---- Disconnecting ------------------------------------------------------ */
  await page.goto(`${ORIGIN}/settings`);
  const row = page.locator("li", { hasText: "E2E Client" }).filter({ hasText: "Reads plans" });
  checkThat("Settings lists the connected apps", (await page.locator("#apps ~ ul li").count()) >= 2);
  await row.first().getByRole("button", { name: "Disconnect" }).click();
  await page.waitForTimeout(1500);
  const after = await fetch(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${readOnly.access_token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  checkThat("a disconnected app's unexpired token is refused at once", after.status === 401, String(after.status));
  const stillConnected = await callTool(tokens.access_token, "list_plans", {});
  checkThat("disconnecting one app leaves the others connected", !stillConnected.isError);

  checkThat("no uncaught errors in the browser", pageErrors.length === 0, pageErrors.join("\n"));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures > 0 ? 1 : 0);
