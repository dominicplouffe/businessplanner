/**
 * Runs once per server start, before any request is served.
 *
 * The only job is to refuse to start a misconfigured production deployment.
 * A site that boots, serves its marketing pages, and then fails at checkout is
 * far harder to diagnose than one that never came up and said which variable
 * it wanted.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionEnv } = await import("./lib/env");
  assertProductionEnv();
}
