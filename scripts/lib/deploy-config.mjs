/* ==========================================================================
   The parts of the deploy that are decisions rather than side effects.
   --------------------------------------------------------------------------
   `scripts/deploy.mjs` talks to AWS, Docker and a human. None of that is
   testable. What *is* testable is everything it decides: whether a key looks
   like the thing it claims to be, what goes into the secret, what is allowed to
   touch the disk, and what to do about a stack in a given CloudFormation state.

   So those live here, pure, and `tests/deploy.test.ts` covers them. The one
   that matters most is `answersToPersist()` — the script remembers answers
   between runs so a twenty-five-minute step can be resumed, and a secret value
   ending up in that file would be the worst defect this script could have.

   No imports beyond `node:crypto`, and no I/O.
   ========================================================================== */

import { randomBytes } from "node:crypto";

/**
 * The four keys the task definition reads out of Secrets Manager.
 *
 * This list is load-bearing: `infra/lib/site-stack.ts` maps each one to a
 * container environment variable with `ecs.Secret.fromSecretsManager`, and a
 * key missing from the secret makes the task fail to start with a message about
 * the secret rather than about the key. A key *added* here and not added there
 * is worse — it looks configured and reaches nothing.
 *
 * `DATABASE_URL` is deliberately absent. It is assembled from the RDS-managed
 * secret's `uri` field, so there is one copy of the password and a rotation
 * does not need a second value updating in step.
 */
export const SECRET_KEYS = [
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
];

/**
 * The one key that may be an empty string.
 *
 * With no Anthropic key the product composes prose with the deterministic
 * generator from figures the engine already computed. That is a real mode, not
 * a degraded one — it is what the end-to-end tests run against — so the script
 * says so rather than treating a blank as a mistake.
 */
export const OPTIONAL_SECRET_KEYS = ["ANTHROPIC_API_KEY"];

/**
 * Written into the secret on the first pass so the service can start.
 *
 * `assertProductionEnv()` refuses to boot without a webhook secret, but Stripe
 * only issues one once the endpoint exists, and the endpoint needs the live URL
 * that the deploy is in the middle of creating. The way out is a placeholder
 * that is obviously a placeholder, replaced before the script reports success —
 * the webhook is the only code that grants an entitlement, so a deploy left on
 * this value takes money and delivers nothing.
 */
export const WEBHOOK_PLACEHOLDER = "whsec_PLACEHOLDER_REPLACE_BEFORE_TAKING_PAYMENTS";

export function isWebhookPlaceholder(value) {
  return value === WEBHOOK_PLACEHOLDER;
}

/** 48 random bytes, base64. What `openssl rand -base64 48` produces, without openssl. */
export function generateAuthSecret() {
  return randomBytes(48).toString("base64");
}

/* ---- Validation ------------------------------------------------------- */

/* Shape checks, not authentication. A mistyped key is found here in a second;
   otherwise it is found by a container that will not start, twenty minutes and
   one force-new-deployment later. Pasting the publishable key (`pk_`) where the
   secret key belongs is the single most common way to get there. */
const RULES = {
  BETTER_AUTH_SECRET: (v) =>
    v.length >= 32 ? null : "must be at least 32 characters — generate one rather than inventing it",
  STRIPE_SECRET_KEY: (v) =>
    /^sk_(test|live)_[A-Za-z0-9]/.test(v)
      ? null
      : v.startsWith("pk_")
        ? "that is the publishable key; the secret key starts sk_test_ or sk_live_"
        : "must start sk_test_ or sk_live_",
  STRIPE_WEBHOOK_SECRET: (v) =>
    isWebhookPlaceholder(v) || /^whsec_[A-Za-z0-9]/.test(v)
      ? null
      : "must start whsec_ — Stripe shows it once, when the endpoint is created",
  ANTHROPIC_API_KEY: (v) =>
    v === "" || /^sk-ant-/.test(v) ? null : "must start sk-ant- or be left empty",
};

/**
 * `null` when the value is acceptable, otherwise why it is not.
 *
 * An unknown key is an error rather than a pass: a typo in a key name would
 * otherwise validate cleanly and then be silently dropped by
 * `buildSecretString`.
 */
export function validateSecretValue(key, value) {
  const rule = RULES[key];
  if (!rule) return `${key} is not one of the keys the task definition reads`;
  if (typeof value !== "string") return `${key} must be a string`;
  if (value === "" && !OPTIONAL_SECRET_KEYS.includes(key)) return `${key} is required`;
  if (value === "") return null;
  if (value.trim() !== value) return `${key} has leading or trailing whitespace — a paste artefact`;
  return rule(value);
}

/**
 * The `--secret-string` payload: exactly `SECRET_KEYS`, in that order, nothing
 * else.
 *
 * Built by hand rather than with `jq`, which the runbook used to require. It
 * throws on a missing or invalid key instead of writing a partial secret,
 * because a secret missing one key is a task that will not start and a
 * CloudFormation event log that does not say which one.
 */
export function buildSecretString(values) {
  const out = {};
  for (const key of SECRET_KEYS) {
    const value = values[key];
    if (value === undefined) throw new Error(`${key} was never answered`);
    const problem = validateSecretValue(key, value);
    if (problem) throw new Error(problem);
    out[key] = value;
  }
  const extra = Object.keys(values).filter((k) => !SECRET_KEYS.includes(k));
  if (extra.length > 0) {
    throw new Error(
      `${extra.join(", ")} would be written to the secret and read by nothing. ` +
        "Add it to the task definition in infra/lib/site-stack.ts first.",
    );
  }
  return JSON.stringify(out);
}

/* ---- What is allowed on disk ------------------------------------------ */

/**
 * The answers worth remembering between runs. Every one is public.
 *
 * The script is resumable, which means it writes down what it was told. This
 * list is the whole of what it may write down — an allow-list rather than a
 * deny-list, so a key added to the prompts later cannot leak by being forgotten
 * here.
 */
export const PERSISTED_KEYS = [
  "region",
  "account",
  "domainName",
  "hostedZoneId",
  "production",
  "repoSlug",
  "lastImageTag",
  "webhookConfigured",
];

/**
 * The subset of `answers` that may be written to `.deploy.json`.
 *
 * Deliberately not `delete answers.STRIPE_SECRET_KEY` and friends: that gets it
 * right until somebody adds a fifth secret. Anything not named above does not
 * survive this function.
 */
export function answersToPersist(answers) {
  const out = {};
  for (const key of PERSISTED_KEYS) {
    if (answers[key] !== undefined) out[key] = answers[key];
  }
  return out;
}

/** Whatever was on disk, filtered the same way. A stale or hand-edited file
 *  cannot introduce a key the script does not expect. */
export function answersFromDisk(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return answersToPersist(raw);
}

/**
 * What `.deploy.json` should say once the stack is gone.
 *
 * Where it was deployed stays, so coming back does not re-ask. What described
 * the running deploy goes: a `lastImageTag` naming an image in a repository that
 * no longer exists is a `--stack-only` pointed at nothing, and a
 * `webhookConfigured` that outlived the secret it was about is simply false.
 */
export function answersAfterTeardown(answers) {
  const kept = answersToPersist(answers);
  delete kept.lastImageTag;
  delete kept.webhookConfigured;
  return kept;
}

/**
 * The name of the snapshot taken as the database is deleted.
 *
 * RDS wants letters, digits and single hyphens, starting with a letter and at
 * most 255 characters — and a name that is already taken fails the delete, so
 * it carries the time to the second rather than just the day.
 */
export function finalSnapshotId(now = new Date()) {
  const stamp = now.toISOString().replace(/\.\d+Z$/, "").replace(/[-:]/g, "").replace("T", "-");
  return `venturelly-final-${stamp}`;
}

/* ---- CloudFormation states -------------------------------------------- */

/**
 * What to do about a stack in a given state.
 *
 * - `create` — no stack, or it was rolled back so far there is nothing left.
 * - `update` — a healthy stack; deploy on top of it.
 * - `recreate` — **the state a failed create leaves behind.** A stack in
 *   `ROLLBACK_COMPLETE` cannot be updated at all; it has to be deleted first,
 *   and deleting it is what exposes the two resources that survive the delete.
 *   `REVIEW_IN_PROGRESS` belongs here too: it is an empty stack left by a change
 *   set that failed to create, and it never leaves that state on its own.
 * - `wait` — something is in flight. Two `cdk deploy`s racing each other is how
 *   a stack reaches one of the `_FAILED` states below.
 * - `manual` — a failed delete or a failed rollback. These need
 *   `--retain-resources` and a human deciding what to keep, and a script that
 *   guesses at that can destroy a database.
 */
export function stackAction(status) {
  if (!status) return "create";
  /* The one `_IN_PROGRESS` that is not in progress. A change set that fails to
     create on a new stack leaves an empty stack parked here indefinitely —
     nothing is running and nothing will change it — so waiting on it is waiting
     forever. It has to be deleted like any other failed create. */
  if (status === "REVIEW_IN_PROGRESS") return "recreate";
  if (status.endsWith("_IN_PROGRESS")) return "wait";
  switch (status) {
    case "CREATE_COMPLETE":
    case "UPDATE_COMPLETE":
    case "UPDATE_ROLLBACK_COMPLETE":
    case "IMPORT_COMPLETE":
    case "IMPORT_ROLLBACK_COMPLETE":
      return "update";
    case "ROLLBACK_COMPLETE":
    case "CREATE_FAILED":
      return "recreate";
    case "DELETE_COMPLETE":
      return "create";
    default:
      return "manual";
  }
}

/* ---- Reading the model back out of the template ----------------------- */

/**
 * The database configuration **as it will actually be deployed**.
 *
 * Read out of the synthesised template rather than restated here, because the
 * point of the preflight check is to catch a stack that asks AWS for something
 * AWS will not give it. A second copy of the engine version in this file could
 * agree with itself while disagreeing with `site-stack.ts`, which is the exact
 * failure being checked for.
 *
 * Returns null when the template carries no database, so a future stack that
 * drops RDS does not fail the preflight.
 */
export function readRdsConfig(template) {
  const resources = template?.Resources ?? {};
  const entry = Object.entries(resources).find(([, r]) => r?.Type === "AWS::RDS::DBInstance");
  if (!entry) return null;
  const [logicalId, resource] = entry;
  const p = resource.Properties ?? {};
  return {
    logicalId,
    engine: p.Engine,
    engineVersion: p.EngineVersion,
    instanceClass: p.DBInstanceClass,
    multiAz: p.MultiAZ === true,
    performanceInsights: p.EnablePerformanceInsights === true,
  };
}

/**
 * Whether what the stack asks for is on the menu, given one page of
 * `aws rds describe-orderable-db-instance-options`.
 *
 * Every finding here is a `CREATE_FAILED` ten minutes into a twenty-five-minute
 * deploy. `Cannot find version 17.2 for postgres` was the first one; the class
 * not existing in the region and Performance Insights not being offered on the
 * smallest burstable classes are the other two that look identical from the
 * outside.
 */
/**
 * Whether an offering's version is the one the stack asks for.
 *
 * The stack pins a *major* version (`"17"`), deliberately — see `BOOTSTRAP_TAG`'s
 * neighbour in `infra/lib/site-stack.ts`. RDS reads that as "the current default
 * minor", but `describe-orderable-db-instance-options` will not take it as a
 * filter, so the caller asks without a version and the match happens here: `17`
 * matches `17.4`, and an exact pin matches only itself.
 */
export function matchesEngineVersion(configured, offered) {
  if (typeof offered !== "string" || typeof configured !== "string") return false;
  if (offered === configured) return true;
  return !configured.includes(".") && offered.startsWith(`${configured}.`);
}

export function checkOrderable(config, rawOptions) {
  const problems = [];
  /* Filter here rather than in the query. An unfiltered list is what the caller
     can actually obtain, and matching a major version against the minors AWS
     offers is the whole question being asked. Offerings that carry no version
     are kept, so a caller that *did* filter server-side is not thrown away. */
  const options = Array.isArray(rawOptions)
    ? rawOptions.filter(
        (o) => o?.EngineVersion === undefined || matchesEngineVersion(config.engineVersion, o.EngineVersion),
      )
    : rawOptions;

  if (!Array.isArray(options) || options.length === 0) {
    problems.push({
      what: `${config.engine} ${config.engineVersion} on ${config.instanceClass}`,
      why: "AWS offers no such combination in this region",
      fix: "infra/lib/site-stack.ts — the engine version or the instance class",
    });
    return problems;
  }
  if (config.multiAz && !options.some((o) => o.MultiAZCapable === true)) {
    problems.push({
      what: "Multi-AZ",
      why: `not available for ${config.instanceClass} here`,
      fix: "infra/lib/site-stack.ts — `multiAz`, or a larger instance class",
    });
  }
  if (config.performanceInsights && !options.some((o) => o.SupportsPerformanceInsights === true)) {
    problems.push({
      what: "Performance Insights",
      why: `not supported on ${config.instanceClass}`,
      fix: "infra/lib/site-stack.ts — `enablePerformanceInsights`, or a larger instance class",
    });
  }
  return problems;
}
