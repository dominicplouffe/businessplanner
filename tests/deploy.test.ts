import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPTIONAL_SECRET_KEYS,
  PERSISTED_KEYS,
  SECRET_KEYS,
  WEBHOOK_PLACEHOLDER,
  answersFromDisk,
  answersToPersist,
  buildSecretString,
  checkOrderable,
  generateAuthSecret,
  isWebhookPlaceholder,
  matchesEngineVersion,
  readRdsConfig,
  stackAction,
  validateSecretValue,
} from "../scripts/lib/deploy-config.mjs";

/* ==========================================================================
   The deploy script's decisions.
   --------------------------------------------------------------------------
   The script itself talks to AWS and cannot be tested here. Everything it
   decides can be, and two of these tests exist for specific incidents:

   - the first real deploy failed ten minutes in on a pinned Postgres minor
     version that AWS had retired, so there is a test that the stack no longer
     pins one; and
   - the script remembers answers between runs, so there is a test that a secret
     value cannot reach that file.
   ========================================================================== */

const FULL = {
  BETTER_AUTH_SECRET: generateAuthSecret(),
  STRIPE_SECRET_KEY: "sk_test_51Abcdefghijklmnop",
  STRIPE_WEBHOOK_SECRET: "whsec_ZmFrZXdlYmhvb2tzZWNyZXQ",
  ANTHROPIC_API_KEY: "sk-ant-api03-abcdef",
};

describe("the keys the script collects", () => {
  it("matches what the task definition actually reads", () => {
    /* The stack is the authority. A key here that the container never receives
       looks configured and reaches nothing; a key the container expects and the
       script never asks for is a task that will not start. */
    const stack = readFileSync("infra/lib/site-stack.ts", "utf8");
    const fromStack = [...stack.matchAll(/fromSecretsManager\(appSecret,\s*"([A-Z_]+)"\)/g)].map(
      (m) => m[1]!,
    );
    expect(fromStack.sort()).toEqual([...SECRET_KEYS].sort());
  });

  it("does not ask for DATABASE_URL", () => {
    // It comes from the RDS-managed secret's `uri` field. Asking for it invites
    // a second copy of the password that a rotation will not update.
    expect(SECRET_KEYS).not.toContain("DATABASE_URL");
    expect(readFileSync("infra/lib/site-stack.ts", "utf8")).toContain(
      'fromSecretsManager(dbSecret, "uri")',
    );
  });

  it("treats only the Anthropic key as optional", () => {
    expect(OPTIONAL_SECRET_KEYS).toEqual(["ANTHROPIC_API_KEY"]);
  });
});

describe("validating what was pasted", () => {
  it("accepts every key in a complete answer set", () => {
    for (const [key, value] of Object.entries(FULL)) {
      expect(validateSecretValue(key, value), key).toBeNull();
    }
  });

  it("catches the publishable key pasted where the secret key goes", () => {
    // The commonest paste error, and it is silent until a checkout fails.
    expect(validateSecretValue("STRIPE_SECRET_KEY", "pk_test_51Abc")).toMatch(/publishable/);
  });

  it("rejects the shapes that would reach AWS and fail there", () => {
    expect(validateSecretValue("STRIPE_SECRET_KEY", "sk_wrong_51Abc")).toMatch(/sk_test_/);
    expect(validateSecretValue("STRIPE_WEBHOOK_SECRET", "we_1Abc")).toMatch(/whsec_/);
    expect(validateSecretValue("ANTHROPIC_API_KEY", "sk-abcdef")).toMatch(/sk-ant-/);
    expect(validateSecretValue("BETTER_AUTH_SECRET", "short")).toMatch(/32 characters/);
  });

  it("catches a paste that brought whitespace with it", () => {
    expect(validateSecretValue("STRIPE_SECRET_KEY", " sk_test_51Abcdefg ")).toMatch(/whitespace/);
  });

  it("requires everything except the Anthropic key", () => {
    expect(validateSecretValue("ANTHROPIC_API_KEY", "")).toBeNull();
    expect(validateSecretValue("STRIPE_SECRET_KEY", "")).toMatch(/required/);
    expect(validateSecretValue("BETTER_AUTH_SECRET", "")).toMatch(/required/);
  });

  it("refuses a key the task definition does not read", () => {
    expect(validateSecretValue("RESEND_API_KEY", "re_abc")).toMatch(/not one of the keys/);
  });

  it("generates an auth secret long enough to pass its own rule", () => {
    const secret = generateAuthSecret();
    expect(validateSecretValue("BETTER_AUTH_SECRET", secret)).toBeNull();
    expect(generateAuthSecret()).not.toBe(secret);
  });
});

describe("the secret payload", () => {
  it("carries exactly the four keys, and parses", () => {
    expect(JSON.parse(buildSecretString(FULL))).toEqual(FULL);
  });

  it("refuses to write a partial secret", () => {
    const missing: Record<string, string> = { ...FULL };
    delete missing.STRIPE_WEBHOOK_SECRET;
    expect(() => buildSecretString(missing)).toThrow(/STRIPE_WEBHOOK_SECRET was never answered/);
  });

  it("refuses to write a key nothing reads", () => {
    expect(() => buildSecretString({ ...FULL, RESEND_API_KEY: "re_abc" })).toThrow(
      /read by nothing/,
    );
  });

  it("lets the placeholder through, and says it is one", () => {
    // Deliberate: the service has to start before Stripe can issue the real
    // secret. The script is what refuses to finish while this value is in place.
    expect(
      buildSecretString({ ...FULL, STRIPE_WEBHOOK_SECRET: WEBHOOK_PLACEHOLDER }),
    ).toContain(WEBHOOK_PLACEHOLDER);
    expect(isWebhookPlaceholder(WEBHOOK_PLACEHOLDER)).toBe(true);
    expect(isWebhookPlaceholder(FULL.STRIPE_WEBHOOK_SECRET)).toBe(false);
  });
});

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

  it("hands a failed delete or rollback to a human", () => {
    // These need `--retain-resources` and a decision about what to keep. A
    // script guessing at that can destroy a database.
    for (const status of ["DELETE_FAILED", "ROLLBACK_FAILED", "UPDATE_ROLLBACK_FAILED"]) {
      expect(stackAction(status), status).toBe("manual");
    }
  });
});

describe("the preflight that would have caught the failure", () => {
  const template = {
    Resources: {
      DatabaseB269D8BB: {
        Type: "AWS::RDS::DBInstance",
        Properties: {
          Engine: "postgres",
          EngineVersion: "17",
          DBInstanceClass: "db.t4g.small",
          MultiAZ: true,
          EnablePerformanceInsights: true,
        },
      },
    },
  };

  it("reads the configuration out of the template rather than restating it", () => {
    expect(readRdsConfig(template)).toEqual({
      logicalId: "DatabaseB269D8BB",
      engine: "postgres",
      engineVersion: "17",
      instanceClass: "db.t4g.small",
      multiAz: true,
      performanceInsights: true,
    });
  });

  it("returns nothing for a template with no database", () => {
    expect(readRdsConfig({ Resources: {} })).toBeNull();
    expect(readRdsConfig(undefined)).toBeNull();
  });

  it("names the failure the first deploy actually hit", () => {
    // `Cannot find version 17.2 for postgres` — an empty orderable-options
    // response is what that looks like before the deploy starts.
    const config = readRdsConfig(template)!;
    const problems = checkOrderable(config, []);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.why).toMatch(/no such combination/);
    expect(problems[0]!.fix).toContain("site-stack.ts");
  });

  it("matches the major version the stack pins against the minors AWS offers", () => {
    /* The stack renders `EngineVersion: "17"` on purpose, and
       describe-orderable-db-instance-options will not take that as a filter — so
       the query asks for every version on the class and the matching happens
       here. Getting this wrong turned the whole check into a silent no-op on the
       first run that used it. */
    expect(matchesEngineVersion("17", "17.4")).toBe(true);
    expect(matchesEngineVersion("17", "17.10")).toBe(true);
    expect(matchesEngineVersion("17", "16.8")).toBe(false);
    // Not a prefix match on digits: 17 must not claim 170.x or 171.
    expect(matchesEngineVersion("17", "170.1")).toBe(false);
    expect(matchesEngineVersion("17", "17")).toBe(true);
    // An exact pin matches only itself.
    expect(matchesEngineVersion("17.4", "17.4")).toBe(true);
    expect(matchesEngineVersion("17.4", "17.5")).toBe(false);
    expect(matchesEngineVersion("17", undefined)).toBe(false);
  });

  it("ignores offerings for a different major version", () => {
    const config = readRdsConfig(template)!;
    // An unfiltered query returns every version on the class. A 16.x that
    // supports everything must not vouch for a 17 that AWS no longer offers.
    expect(
      checkOrderable(config, [
        { EngineVersion: "16.8", MultiAZCapable: true, SupportsPerformanceInsights: true },
      ]),
    ).toHaveLength(1);

    expect(
      checkOrderable(config, [
        { EngineVersion: "16.8", MultiAZCapable: true, SupportsPerformanceInsights: true },
        { EngineVersion: "17.4", MultiAZCapable: true, SupportsPerformanceInsights: true },
      ]),
    ).toEqual([]);
  });

  it("keeps an offering that carries no version, for a caller that filtered already", () => {
    const config = readRdsConfig(template)!;
    expect(
      checkOrderable(config, [{ MultiAZCapable: true, SupportsPerformanceInsights: true }]),
    ).toEqual([]);
  });

  it("does not pass a major version to RDS as a filter", () => {
    // The bug this whole group exists for: `--engine-version 17` is rejected,
    // the call returns nothing, and the check silently does not run.
    expect(readFileSync("scripts/deploy.mjs", "utf8")).toMatch(
      /pinsMinor\s*\?\s*\["--engine-version", config\.engineVersion\]\s*:\s*\[\]/,
    );
  });

  it("names Multi-AZ and Performance Insights separately", () => {
    const config = readRdsConfig(template)!;
    const problems = checkOrderable(config, [
      { EngineVersion: "17.4", MultiAZCapable: false, SupportsPerformanceInsights: false },
    ]);
    expect(problems.map((p) => p.what)).toEqual(["Multi-AZ", "Performance Insights"]);
  });

  it("passes a configuration AWS offers", () => {
    const config = readRdsConfig(template)!;
    expect(
      checkOrderable(config, [
        { EngineVersion: "17.4", MultiAZCapable: true, SupportsPerformanceInsights: true },
      ]),
    ).toEqual([]);
  });
});

describe("the regression the second deploy was", () => {
  /* `CREATE_FAILED | AWS::ECS::Service | "ECS Deployment Circuit Breaker was
     triggered"`, then a full rollback of twenty-five minutes of RDS and
     CloudFront. The ECR repository is created by the same stack, so a first
     deploy has nothing to pull — and CloudFormation blocks until an ECS service
     reaches steady state, which a service that cannot start a task never does.

     These are source assertions rather than template ones on purpose. Proving
     it properly means two `cdk synth` runs, which is twenty seconds against a
     suite that takes eight, for an invariant whose realistic failure is somebody
     deleting the branch. DEPLOY.md carries the two-synth command, and it is what
     the change was verified with:

       imageTag=bootstrap → DesiredCount 0, no scalable target
       imageTag=abc1234   → DesiredCount 2, one scalable target, MinCapacity 2 */
  const stack = () => readFileSync("infra/lib/site-stack.ts", "utf8");

  it("asks for no tasks when there is no image to run", () => {
    expect(stack()).toMatch(/desiredCount:\s*bootstrapping\s*\?\s*0\s*:/);
  });

  it("does not register a scalable target that would undo it", () => {
    // Application Auto Scaling enforces minCapacity, so a scalable target with
    // a minimum of 2 puts the count straight back and the service hangs again.
    // This is the half of the fix that is easy to miss.
    expect(stack()).toMatch(/if\s*\(isProduction\s*&&\s*!bootstrapping\)/);
  });

  it("derives bootstrapping from the tag rather than a second flag", () => {
    expect(stack()).toMatch(/const bootstrapping = props\.imageTag === BOOTSTRAP_TAG/);
    expect(stack()).toMatch(/export const BOOTSTRAP_TAG = "bootstrap"/);
  });

  it("does not retain or protect a database on the deploy that might not finish", () => {
    /* ROLLBACK_FAILED, with DELETE_FAILED on both data subnets and the database
       security group — and nothing on the database itself, because RETAIN did
       what it says and kept it. The retained instance's network interfaces held
       the subnets, so the rollback could not finish, and clearing it meant
       deleting by hand a database that had never finished being created.

       There is nothing to protect on a bootstrap deploy; the protections belong
       to the second one, which is also the one that brings the service up. */
    expect(stack()).toMatch(/deletionProtection:\s*isProduction && !bootstrapping/);
    expect(stack()).toMatch(/isProduction && !bootstrapping \? RemovalPolicy\.RETAIN/);
  });

  it("still retains and protects it on every deploy after the first", () => {
    // The guarantee the RETAIN exists for is not being traded away — only
    // deferred by one deploy, to the point where there is something to lose.
    expect(stack()).toContain("RemovalPolicy.RETAIN");
    expect(stack()).toMatch(/removalPolicy:\s*\n?\s*isProduction/);
  });

  it("is the tag the deploy script actually passes on the first deploy", () => {
    // A stack that bootstraps on "bootstrap" and a script that passes
    // "bootstrapping" would both look right and fail together.
    expect(readFileSync("scripts/deploy.mjs", "utf8")).toContain('"imageTag=bootstrap"');
  });
});

describe("the regression the first deploy was", () => {
  it("does not pin a Postgres minor version", () => {
    /* `CREATE_FAILED … Cannot find version 17.2 for postgres`. AWS retires
       minor versions on a schedule, so a pinned minor is a deploy that stops
       working on a date nobody wrote down. `VER_17` renders `EngineVersion:
       "17"`, which RDS reads as the current default minor. */
    const stack = readFileSync("infra/lib/site-stack.ts", "utf8");
    const pins = [...stack.matchAll(/PostgresEngineVersion\.(VER_[0-9]+(?:_[0-9]+)?)/g)].map(
      (m) => m[1]!,
    );
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      expect(pin, `${pin} pins a minor version`).toMatch(/^VER_[0-9]+$/);
    }
  });
});
