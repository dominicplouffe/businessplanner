import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PERSISTED_KEYS,
  SECRET_KEYS,
  answersAfterTeardown,
  answersFromDisk,
  answersToPersist,
  finalSnapshotId,
  generateAuthSecret,
  stackAction,
} from "../scripts/lib/deploy-config.mjs";

/* ==========================================================================
   The CDK teardown's decisions.
   --------------------------------------------------------------------------
   The ECS/RDS/CloudFront stack is retired in favour of Lightsail, and
   `scripts/deploy.mjs` now runs only `--destroy`, which removes it. What that
   teardown decides is checked here: the order it deletes in, what it confirms
   first, the stack states it will and will not touch, and that the answers it
   writes down never carry a secret.

   Delete this file with `scripts/deploy.mjs` and `scripts/lib/deploy-config.mjs`
   once the stack is confirmed gone.
   ========================================================================== */

const FULL = {
  BETTER_AUTH_SECRET: generateAuthSecret(),
  STRIPE_SECRET_KEY: "sk_test_51Abcdefghijklmnop",
  STRIPE_WEBHOOK_SECRET: "whsec_ZmFrZXdlYmhvb2tzZWNyZXQ",
  ANTHROPIC_API_KEY: "sk-ant-api03-abcdef",
};

describe("what the script is allowed to write down", () => {
  it("never persists a secret value", () => {
    /* The invariant that matters most in this file. The script writes answers
       to `.deploy.json` so a twenty-five-minute step can be resumed, and a key
       landing there would put production credentials in the working tree. */
    const persisted = JSON.stringify(
      answersToPersist({
        region: "us-east-1",
        account: "976254575751",
        domainName: "getventurely.com",
        hostedZoneId: "Z0123456789ABC",
        production: true,
        ...FULL,
      }),
    );

    for (const value of Object.values(FULL)) {
      expect(persisted, `leaked a secret value`).not.toContain(value);
    }
    for (const key of SECRET_KEYS) {
      expect(persisted, `leaked the key ${key}`).not.toContain(key);
    }
    expect(JSON.parse(persisted)).toMatchObject({ account: "976254575751" });
  });

  it("is an allow-list, so a future answer cannot leak by being forgotten", () => {
    expect(answersToPersist({ SOME_FUTURE_TOKEN: "sensitive" })).toEqual({});
    expect(PERSISTED_KEYS.some((k) => SECRET_KEYS.includes(k))).toBe(false);
  });

  it("filters the file it reads back the same way", () => {
    expect(answersFromDisk({ region: "us-east-1", STRIPE_SECRET_KEY: "sk_test_x" })).toEqual({
      region: "us-east-1",
    });
    for (const junk of [null, undefined, "a string", 42, ["an", "array"]]) {
      expect(answersFromDisk(junk)).toEqual({});
    }
  });
});

describe("deciding what to do with the stack that is already there", () => {
  it("knows the state the failed first deploy left behind", () => {
    // `ROLLBACK_COMPLETE` cannot be updated. Deleting it is the only way
    // forward, and deleting it is what exposes the retained ECR repository and
    // the secret pending deletion.
    expect(stackAction("ROLLBACK_COMPLETE")).toBe("recreate");
    expect(stackAction("CREATE_FAILED")).toBe("recreate");
  });

  it("deploys onto a healthy stack and creates a missing one", () => {
    expect(stackAction("CREATE_COMPLETE")).toBe("update");
    expect(stackAction("UPDATE_COMPLETE")).toBe("update");
    expect(stackAction("UPDATE_ROLLBACK_COMPLETE")).toBe("update");
    expect(stackAction(undefined)).toBe("create");
    expect(stackAction("DELETE_COMPLETE")).toBe("create");
  });

  it("waits rather than racing a deploy already in flight", () => {
    for (const status of ["CREATE_IN_PROGRESS", "UPDATE_IN_PROGRESS", "DELETE_IN_PROGRESS"]) {
      expect(stackAction(status), status).toBe("wait");
    }
  });

  it("does not wait for the one _IN_PROGRESS that is not in progress", () => {
    /* A change set that fails to create on a new stack parks an empty stack in
       REVIEW_IN_PROGRESS forever. Treating it as in flight means waiting for
       something that will never happen — forty minutes, then a timeout. */
    expect(stackAction("REVIEW_IN_PROGRESS")).toBe("recreate");
  });

  it("hands a failed delete or rollback to a human", () => {
    // These need `--retain-resources` and a decision about what to keep. A
    // script guessing at that can destroy a database.
    for (const status of ["DELETE_FAILED", "ROLLBACK_FAILED", "UPDATE_ROLLBACK_FAILED"]) {
      expect(stackAction(status), status).toBe("manual");
    }
  });
});

describe("the way out", () => {
  const script = () => readFileSync("scripts/deploy.mjs", "utf8");

  it("does not let readline swallow Ctrl-C", () => {
    /* A readline interface on a TTY intercepts Ctrl-C: with no SIGINT listener
       it emits `pause` on the stream instead of letting the signal reach the
       process. Harmless while an interface was created and closed around each
       question; a five-minute wait nobody could escape once one interface was
       kept open for the whole run. `process.on("SIGINT")` alone does not help,
       because readline consumes it first — the listener has to be on the
       interface. */
    expect(script()).toMatch(/reader\.on\("SIGINT"/);
    expect(script()).toMatch(/process\.on\("SIGINT", interrupted\)/);
  });

  it("says what the interrupt cost at every step", () => {
    const notes = script().slice(script().indexOf("const INTERRUPT_NOTES"));
    for (let step = 1; step <= 9; step += 1) {
      expect(notes.slice(0, notes.indexOf("};")), `step ${step}`).toContain(`${step}:`);
    }
  });

  it("points at the step to resume from", () => {
    expect(script()).toContain("node scripts/deploy.mjs --from=");
  });
});

describe("taking it down", () => {
  const script = () => readFileSync("scripts/deploy.mjs", "utf8");
  const teardown = () => script().slice(script().indexOf("async function destroy("));

  it("deletes the database before the stack, or the stack cannot delete", () => {
    /* The production database is RETAINed, so CloudFormation skips it and its
       network interfaces hold the data subnets — the stack ends DELETE_FAILED
       and the most expensive resource keeps billing. */
    const body = teardown();
    expect(body.indexOf('"rds", "delete-db-instance"')).toBeGreaterThan(-1);
    expect(body.indexOf('"rds", "delete-db-instance"')).toBeLessThan(
      body.indexOf('"cloudformation", "delete-stack"'),
    );
  });

  it("deletes nothing until the domain has been typed back", () => {
    const body = teardown();
    const confirmAt = body.indexOf("if (typed !== domain)");
    expect(confirmAt).toBeGreaterThan(-1);
    for (const call of ['"modify-db-instance"', '"delete-db-instance"', '"delete-stack"',
      '"delete-repository"', '"delete-secret"']) {
      expect(body.indexOf(call), call).toBeGreaterThan(confirmAt);
    }
  });

  it("frees both fixed names, so coming back does not collide", () => {
    expect(teardown()).toContain('"ecr", "delete-repository"');
    expect(teardown()).toContain('"--force-delete-without-recovery"');
  });

  it("forgets the running deploy and remembers where it was", () => {
    const after = answersAfterTeardown({
      region: "us-east-1",
      domainName: "getventurely.com",
      lastImageTag: "abc123",
      webhookConfigured: true,
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(after).toEqual({ region: "us-east-1", domainName: "getventurely.com" });
  });

  it("names the final snapshot the way RDS accepts", () => {
    const id = finalSnapshotId(new Date("2026-09-22T18:04:05.123Z"));
    expect(id).toBe("venturelly-final-20260922-180405");
    expect(id).toMatch(/^[a-z](?!.*--)[a-z0-9-]{0,254}[a-z0-9]$/);
  });
});
