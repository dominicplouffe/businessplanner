#!/usr/bin/env node
/* ==========================================================================
   Deploy Venturelly to AWS, one question at a time.
   --------------------------------------------------------------------------
   `DEPLOY.md` used to be the whole of this: seven manual steps across three
   tools, with an ordering trap (an `export` that has to precede the bootstrap
   that needs it), a chicken-and-egg (the Stripe webhook secret cannot exist
   until the deploy that needs it has finished), two local tool dependencies
   (`jq`, `openssl`), and no recovery path for a failed first create. The first
   real run failed ten minutes into a twenty-five-minute step, which is exactly
   when a runbook stops being enough.

   Three properties, in order of how much they matter:

   1. **Idempotent.** Every step asks AWS whether it has already been done. A
      failure part-way through is recovered by running the same command again.
      That is the only property that counts when a step takes half an hour.
   2. **It checks before it starts.** The preflight reads the database
      configuration out of the synthesised template and asks RDS whether that
      combination is orderable in the region. `Cannot find version 17.2 for
      postgres` becomes two seconds instead of ten minutes.
   3. **Answers persist; secrets never do.** Non-secret answers go to
      `.deploy.json` so a re-run does not re-ask. Secret values are held in
      memory and written straight to Secrets Manager. `tests/deploy.test.ts`
      enforces that.

   Node with no dependencies, which is also what removes `jq` and `openssl`:
   `JSON.stringify` and `crypto.randomBytes` do both jobs.

       node scripts/deploy.mjs              # the whole thing, resumable
       node scripts/deploy.mjs --dry-run    # every question and command, writing nothing
       node scripts/deploy.mjs --from=5     # resume at a step

   Invoked with `node`, not through a package manager. `pnpm deploy:aws` is an
   alias in `package.json`, but a script whose whole point is having no
   dependencies must not need one installed to start it — the first person to run
   this did not have pnpm. Paths resolve from this file rather than the working
   directory, so it runs correctly from anywhere in the repository.
   ========================================================================== */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OPTIONAL_SECRET_KEYS,
  SECRET_KEYS,
  WEBHOOK_PLACEHOLDER,
  answersAfterTeardown,
  answersFromDisk,
  answersToPersist,
  buildSecretString,
  checkOrderable,
  finalSnapshotId,
  generateAuthSecret,
  matchesEngineVersion,
  isWebhookPlaceholder,
  readRdsConfig,
  stackAction,
  validateSecretValue,
} from "./lib/deploy-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INFRA = join(ROOT, "infra");
const ANSWER_FILE = join(ROOT, ".deploy.json");

/** Must match `BOOTSTRAP_TAG` in `infra/lib/site-stack.ts`, which branches on it
 *  to create the service with no tasks. `tests/deploy.test.ts` checks the pair. */
const BOOTSTRAP_TAG = "bootstrap";

const SITE_STACK = "VenturellySite";
const CERT_STACK = "VenturellyCertificate";
const ECR_REPOSITORY = "venturelly";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FROM = Number(argv.find((a) => a.startsWith("--from="))?.slice(7) ?? 0);

/* Deploy the CloudFormation stack without rebuilding the image.

   Written after giving somebody the wrong advice. A fix that lives in the stack
   — a secret key, an instance class, a flag on the service — reaches AWS only
   through the `cdk deploy` inside step 6, which also builds and pushes an image
   that has not changed. The choice was a pointless ten-minute build or a `cdk
   deploy` typed by hand with the four context flags remembered correctly. */
const STACK_ONLY = argv.includes("--stack-only");

/* Take everything billable down, for the stretch when the site is not in use.
   `cdk destroy` cannot do it — see `destroy()` for why. */
const DESTROY = argv.includes("--destroy");

const USAGE = `Deploy Venturelly to AWS.

  node scripts/deploy.mjs                the whole thing, resumable
  node scripts/deploy.mjs --dry-run      every question and command, writing nothing
  node scripts/deploy.mjs --from=6       resume at a step (preflight always runs)
  node scripts/deploy.mjs --stack-only   redeploy the stack, no image rebuild
  node scripts/deploy.mjs --destroy      tear it all down; asks you to type the domain first
  node scripts/deploy.mjs --help         this

Steps:
  1 preflight          6 build and push the image
  2 bootstrap CDK      7 wait for the service
  3 recover a failure  8 point Stripe at the webhook
  4 create the stacks  9 GitHub deploy role (optional)
  5 the app secret

Needs the AWS CLI v2 and working credentials; Docker from step 6.
DEPLOY.md has the manual equivalent of every step.
`;

if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

/* An unrecognised flag is a typo, and a typo that is ignored is a deploy that
   does something other than what was asked for. */
const unknown = argv.filter(
  (a) => a !== "--dry-run" && a !== "--stack-only" && a !== "--destroy" && !a.startsWith("--from="),
);
if (unknown.length > 0) {
  process.stderr.write(`Unrecognised: ${unknown.join(" ")}\n\n${USAGE}`);
  process.exit(2);
}
if (DESTROY && argv.some((a) => a === "--stack-only" || a.startsWith("--from="))) {
  process.stderr.write("--destroy combines with --dry-run and nothing else.\n");
  process.exit(2);
}
if (argv.some((a) => a.startsWith("--from=")) && !Number.isInteger(FROM)) {
  process.stderr.write("--from= takes a step number, 1 to 9.\n");
  process.exit(2);
}

/* ---- Output ------------------------------------------------------------ */

const tty = process.stdout.isTTY === true;
const c = (code) => (s) => (tty ? `\u001b[${code}m${s}\u001b[0m` : s);
const bold = c("1");
const dim = c("2");
const green = c("32");
const yellow = c("33");
const red = c("31");
const cyan = c("36");

const out = (s = "") => process.stdout.write(`${s}\n`);
const ok = (s) => out(`  ${green("✓")} ${s}`);
const skip = (s) => out(`  ${dim("·")} ${dim(s)}`);
const warn = (s) => out(`  ${yellow("!")} ${s}`);
const note = (s) => out(`    ${dim(s)}`);

/* Numbered explicitly rather than counted, because `--from=` skips steps and a
   number that drifts is worse than no number — DEPLOY.md refers to these. */
/* Which step is running, so an interrupt can say where it happened. */
let currentStep = 1;

function heading(n, title) {
  currentStep = n;
  out();
  out(bold(`${n}. ${title}`));
}

/**
 * The steps where Ctrl-C costs nothing, and what it costs where it does.
 *
 * Worth saying rather than leaving somebody to guess. Step 7 is the common one:
 * it waits for the service and polls `/api/health`, observing only — the image
 * was pushed and the stack deployed back in step 6, so interrupting changes
 * nothing in AWS. The ones that are not safe say what is in flight instead.
 */
const INTERRUPT_NOTES = {
  1: ["Nothing had started.", "Preflight only reads."],
  2: ["`cdk bootstrap` may be part-way.", "Re-running is safe; it is idempotent."],
  3: ["A delete may be in flight.", "Re-run and it will wait for the stack to settle."],
  4: [
    "CloudFormation carries on server-side — closing this does not stop it.",
    "Re-run once the stack settles; step 3 handles whatever state it lands in.",
  ],
  5: ["The secret may or may not have been written.", "Re-run from step 5 to write all four keys again."],
  6: ["A build or push may be part-way. Both are safe to repeat."],
  7: [
    "Nothing was lost: this step only watches.",
    "The image is pushed and the stack is deployed.",
  ],
  8: ["The webhook secret was not stored.", "The service is still on the placeholder."],
  9: ["The IAM role may be part-way; re-running finishes it."],
};

/* Ctrl-C should not leave somebody wondering what it broke. Registered on the
   process for the stretches before any prompt exists, and on the readline
   interface — see `input()` — for everywhere else. */
function interrupted() {
  out();
  out();
  if (DESTROY) {
    out(yellow("Interrupted during the teardown."));
    note("Any delete already started carries on server-side — closing this does not stop it.");
    out();
    out(`  Pick up where it stopped:  ${bold("node scripts/deploy.mjs --destroy")}`);
    out();
    closeInput();
    process.exit(130);
  }
  out(yellow(`Interrupted during step ${currentStep}.`));
  for (const line of INTERRUPT_NOTES[currentStep] ?? []) note(line);
  const resume = currentStep >= 8 ? currentStep : Math.max(2, currentStep);
  out();
  out(`  Resume with:  ${bold(`node scripts/deploy.mjs --from=${resume}`)}`);
  if (currentStep === 7) {
    note("If the service is already healthy, go straight to step 8 — the Stripe webhook");
    note("is the only thing that grants an entitlement, and it is still a placeholder.");
  }
  out();
  closeInput();
  process.exit(130);
}

process.on("SIGINT", interrupted);

/** Stop, with the reason and what to do about it. Never a stack trace: every
 *  exit from this script is a condition somebody has to act on. */
function stop(reason, ...remedy) {
  out();
  out(red(`✗ ${reason}`));
  for (const line of remedy) out(`  ${line}`);
  out();
  process.exit(1);
}

/* ---- Asking ------------------------------------------------------------ */

/* One reader for the whole run, with a queue in front of it.
   Two reasons, and the second is the one that cost an hour. A fresh
   `createInterface` per question drains the stream it is given, so the second
   question sees nothing. And `rl.question()` only hears the line that arrives
   while it is waiting — a piped stdin delivers every line at once, so
   everything after the first answer is emitted to nobody and lost. Queuing the
   lines makes the script work the same whether it is typed at or piped into,
   which is also what makes it verifiable without a terminal. */
let reader = null;
let masking = false;
let inputClosed = false;
const buffered = [];
const waiting = [];

function input() {
  if (reader) return reader;
  reader = createInterface({ input: process.stdin, output: process.stdout });
  reader.on("line", (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else buffered.push(line);
  });
  reader.on("close", () => {
    inputClosed = true;
    for (const waiter of waiting.splice(0)) waiter(null);
  });
  /* Without this, Ctrl-C does nothing for the whole run.

     A readline interface on a TTY intercepts Ctrl-C: with no `SIGINT` listener
     attached it emits `pause` on the stream rather than letting the signal reach
     the process. That was harmless while an interface was created and closed
     around each question; it became a five-minute wait nobody could escape once
     one interface was kept open for the whole run — which is how the piped-input
     fix broke the only way out. `process.on("SIGINT")` is not enough on its own,
     because readline consumes it first. */
  reader.on("SIGINT", () => interrupted());
  /* `_writeToOutput` is readline's own hook for suppressing the echo and has
     been stable for a decade, but it is not public API. A live Stripe key
     pasted onto a shared screen is what it is here for. */
  reader._writeToOutput = (s) => {
    if (!masking) reader.output.write(s);
    else if (s.includes("\n")) reader.output.write("\n");
  };
  return reader;
}

function closeInput() {
  if (reader && !inputClosed) reader.close();
}

const ENDED = "Input ended. This needs a terminal — run it from your own shell.";

function prompt(query, { hidden = false } = {}) {
  input();

  const already = buffered.shift();
  if (already !== undefined) {
    out(`${query}${hidden ? dim("(hidden)") : already}`);
    return Promise.resolve(already.trim());
  }
  if (inputClosed) return Promise.reject(new Error(ENDED));

  process.stdout.write(query);
  masking = hidden;
  return new Promise((done, fail) => {
    waiting.push((line) => {
      masking = false;
      if (hidden) out();
      if (line === null) fail(new Error(ENDED));
      else done(line.trim());
    });
  });
}

async function ask(label, { fallback, validate, hidden = false, optional = false } = {}) {
  const suffix = fallback !== undefined && fallback !== "" ? ` ${dim(`[${fallback}]`)}` : "";
  for (;;) {
    const raw = await prompt(`  ${cyan("?")} ${label}${suffix}: `, { hidden });
    const value = raw === "" && fallback !== undefined ? String(fallback) : raw;
    if (value === "" && !optional) {
      warn("Required.");
      continue;
    }
    const problem = validate?.(value);
    if (problem) {
      warn(problem);
      continue;
    }
    return value;
  }
}

async function confirm(label, fallback = true) {
  const answer = await prompt(`  ${cyan("?")} ${label} ${dim(fallback ? "[Y/n]" : "[y/N]")}: `);
  if (answer === "") return fallback;
  return /^y(es)?$/i.test(answer);
}

/* ---- Running things ---------------------------------------------------- */

/**
 * A command, shown before it runs.
 *
 * `mutates` is what `--dry-run` keys off: a read is still performed in a dry
 * run so the report reflects reality, a write is only printed. With no
 * credentials at all — which is how this is developed — reads fail and the dry
 * run says so rather than pretending.
 */
/* Values that must not reach the terminal. A dry run's transcript lives in
   somebody's scrollback, and the whole point of writing the secret straight to
   Secrets Manager is that it does not end up anywhere else. Policy documents are
   not secret, only long. */
const HIDE_AFTER = new Set(["--secret-string"]);
const SHORTEN_AFTER = new Set(["--policy-document", "--assume-role-policy-document"]);

function forDisplay(args) {
  return args.map((arg, i) => {
    const flag = args[i - 1];
    if (HIDE_AFTER.has(flag)) return "<redacted>";
    if (SHORTEN_AFTER.has(flag)) return "<json>";
    return arg;
  });
}

function run(command, args, { mutates = true, capture = false, allowFail = false, cwd = ROOT } = {}) {
  const shown = `${command} ${forDisplay(args).join(" ")}`;
  if (mutates && DRY) {
    out(`    ${dim("would run:")} ${shown}`);
    return { status: 0, stdout: "", dryRun: true };
  }
  if (!capture) out(`    ${dim("$")} ${shown}`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error?.code === "ENOENT") {
    stop(`\`${command}\` is not installed, or not on PATH.`, `Needed for: ${shown}`);
  }
  if (result.status !== 0 && !allowFail) {
    if (capture && result.stderr) out(result.stderr.trimEnd());
    stop(`\`${shown}\` failed (exit ${result.status}).`);
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

let REGION = "us-east-1";

/* How to invoke Docker, resolved once and used for every call.

   Not cosmetic. `docker login` writes credentials into the home directory of
   whoever runs it, so prefixing `sudo` on the build alone leaves the push
   authenticating as root against a config written by the user — a successful
   build followed by a denied push, which reads as an ECR problem and is not
   one. Login, build and push all go through this. */
let DOCKER = ["docker"];

/**
 * Ask the daemon, not the client.
 *
 * `docker --version` prints the client's own version without contacting
 * anything, so it succeeds on a machine where Docker is unreachable. It did:
 * `✓ Docker version 29.7.2` was printed immediately before
 * `permission denied while trying to connect to the docker API`. `docker
 * version --format {{.Server.Version}}` fails unless the daemon answers.
 */
function probeDocker(command = DOCKER) {
  const probe = run(command[0], [...command.slice(1), "version", "--format", "{{.Server.Version}}"], {
    mutates: false,
    capture: true,
    allowFail: true,
  });
  return { ok: probe.status === 0, version: (probe.stdout ?? "").trim(), why: (probe.stderr ?? "").trim() };
}

/**
 * Whether Docker can be used, and how.
 *
 * Returns false rather than stopping when it cannot: steps 1–5 are useful on a
 * machine that will never build the image, and the GitHub deploy role exists
 * precisely so CI can build instead.
 */
async function resolveDocker({ interactive = true } = {}) {
  const direct = probeDocker(["docker"]);
  if (direct.ok) {
    DOCKER = ["docker"];
    return direct;
  }

  const denied = /permission denied|connect to the Docker daemon|docker\.sock/i.test(direct.why);
  if (!denied) {
    warn("The Docker daemon is not answering.");
    if (direct.why) note(direct.why.split("\n")[0]);
    note("Start Docker (or the daemon) before step 6.");
    return direct;
  }

  warn("Docker is running, but this user cannot reach its socket.");
  note("The permanent fix, which every later run needs too:");
  note("  sudo usermod -aG docker $USER      # then log out and back in, or: newgrp docker");
  if (!interactive) return direct;

  if (!(await confirm("Use `sudo docker` for this run instead?", true))) return direct;

  const elevated = probeDocker(["sudo", "docker"]);
  if (!elevated.ok) {
    warn("`sudo docker` did not work either.");
    if (elevated.why) note(elevated.why.split("\n")[0]);
    return elevated;
  }
  DOCKER = ["sudo", "docker"];
  /* And therefore the ECR login too, or the push authenticates as one user
     against a config written by another. */
  ok("using `sudo docker` — the ECR login goes through it as well");
  return elevated;
}

/* Why the last `aws` call returned null.
   A read that fails is usually a question being answered "no", so `aws` returns
   null rather than stopping — but a check that quietly does not run is worse
   than one that fails, so the reason is kept for whoever wants to print it. */
let lastAwsError = "";

/** The AWS CLI, always with an explicit region and always parsed as JSON.
 *  Returns null when the call fails, so "does this exist?" reads naturally. */
function aws(args, { mutates = true, allowFail = false } = {}) {
  const full = [...args, "--region", REGION, "--output", "json"];
  const result = run("aws", full, { mutates, capture: true, allowFail: allowFail || !mutates });
  if (result.dryRun) return { dryRun: true };
  if (result.status !== 0) {
    lastAwsError = (result.stderr ?? "").trim();
    return null;
  }
  const text = (result.stdout ?? "").trim();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const cdk = (args, options = {}) => run("npx", ["cdk", ...args], { cwd: INFRA, ...options });

function cdkContext(a) {
  const context = [
    "--context", `account=${a.account}`,
    "--context", `domainName=${a.domainName}`,
    "--context", `production=${a.production ? "true" : "false"}`,
  ];
  if (a.hostedZoneId) context.push("--context", `hostedZoneId=${a.hostedZoneId}`);
  return context;
}

/* ---- Answers ----------------------------------------------------------- */

function loadAnswers() {
  if (!existsSync(ANSWER_FILE)) return {};
  try {
    return answersFromDisk(JSON.parse(readFileSync(ANSWER_FILE, "utf8")));
  } catch {
    warn(`${ANSWER_FILE} is not readable JSON; starting from scratch.`);
    return {};
  }
}

function saveAnswers(answers) {
  if (DRY) return;
  writeFileSync(ANSWER_FILE, `${JSON.stringify(answersToPersist(answers), null, 2)}\n`);
}

/* ==========================================================================
   Step 1 — preflight
   ========================================================================== */

function stackStatus(name) {
  const described = aws(["cloudformation", "describe-stacks", "--stack-name", name], {
    mutates: false,
  });
  return described?.Stacks?.[0]?.StackStatus;
}

function stackOutputs(name) {
  const described = aws(["cloudformation", "describe-stacks", "--stack-name", name], {
    mutates: false,
  });
  const outputs = described?.Stacks?.[0]?.Outputs ?? [];
  return Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]));
}

async function preflight(answers) {
  heading(1, "Preflight");

  const [major] = process.versions.node.split(".");
  if (Number(major) < 22) stop(`Node ${process.versions.node}; this needs 22 or newer.`);
  ok(`Node ${process.versions.node}`);

  const cli = run("aws", ["--version"], { mutates: false, capture: true, allowFail: true });
  if (cli.status !== 0) {
    stop(
      "The AWS CLI is not installed.",
      "Install v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
    );
  }
  if (!/aws-cli\/2\./.test(cli.stdout)) warn(`${cli.stdout.trim()} — v2 is what this is written for.`);
  else ok(cli.stdout.trim().split(" ")[0]);

  /* A resume is not an interview.

     `--from=6` is somebody coming back after fixing Docker, and asking them for
     the region and the domain again — with the saved values already in the
     brackets — reads as the flag having been ignored. Anything already answered
     is used as it stands; `.deploy.json` is editable, and a fresh run re-asks. */
  const resuming = FROM > 1;
  const remembered = async (key, label, options) => {
    const saved = answers[key];
    if (resuming && saved !== undefined && saved !== "") {
      note(`${label}: ${saved} ${dim("(remembered)")}`);
      return String(saved);
    }
    return ask(label, { ...options, fallback: saved ?? options?.fallback });
  };

  /* Region first: every `aws` call below carries it explicitly, because a
     command that silently uses a different region than the stacks is a whole
     evening. */
  REGION = await remembered("region", "AWS region", { fallback: "us-east-1" });
  answers.region = REGION;

  const identity = aws(["sts", "get-caller-identity"], { mutates: false });
  if (!identity?.Account) {
    stop(
      "`aws sts get-caller-identity` did not return an account.",
      "Nothing below can work until it does. Configure credentials with `aws configure`",
      "or by exporting AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN.",
    );
  }
  ok(`Account ${bold(identity.Account)} as ${dim(identity.Arn)}`);
  if (/:root$/.test(identity.Arn ?? "")) {
    warn("These are root credentials. They will work; an IAM user with admin is the better habit.");
  }
  answers.account = identity.Account;

  answers.domainName = await remembered("domainName", "Domain", { fallback: "getventurely.com" });

  /* The hosted zone, named rather than looked up.

     `HostedZone.fromLookup` against a zone that does not exist does not fail —
     it returns a placeholder and lets the deploy run until certificate
     validation hangs with nothing on screen to explain it. So the zone is
     resolved here, where saying "there isn't one" is cheap. */
  const zones = aws(["route53", "list-hosted-zones-by-name", "--dns-name", answers.domainName], {
    mutates: false,
  });
  const match = (zones?.HostedZones ?? []).find(
    (z) => z.Name === `${answers.domainName}.` && z.Config?.PrivateZone !== true,
  );
  if (match) {
    answers.hostedZoneId = match.Id.replace("/hostedzone/", "");
    ok(`Hosted zone ${bold(answers.hostedZoneId)} for ${answers.domainName}`);
  } else if (zones === null) {
    warn("Could not list hosted zones — no Route 53 permission, or no credentials in a dry run.");
    answers.hostedZoneId = await ask("Hosted zone ID", {
      fallback: answers.hostedZoneId,
      optional: true,
    });
  } else {
    stop(
      `No public Route 53 hosted zone for ${answers.domainName} in account ${answers.account}.`,
      "Certificate validation needs one, and CDK's lookup returns a placeholder rather than",
      "failing — so the deploy would appear to work and then hang.",
      "",
      "  Create the zone, then point the registrar's nameservers at it and wait for that",
      "  to propagate before re-running:",
      `    aws route53 create-hosted-zone --name ${answers.domainName} --caller-reference $(date +%s)`,
    );
  }

  if (answers.production === undefined) {
    answers.production = await confirm(
      "Production sizing? (Multi-AZ, 2 tasks, autoscaling — $90–130/mo; no is roughly half)",
      true,
    );
  }
  ok(`${answers.production ? "Production" : "Staging"} sizing`);

  if (!existsSync(join(INFRA, "node_modules"))) {
    out(`  ${dim("installing infra dependencies")}`);
    run("npm", ["ci"], { cwd: INFRA });
  }
  ok("infra dependencies present");

  await checkDatabaseIsOrderable(answers);

  /* Step 6 is twenty-five minutes away and a broken Docker is knowable now.
     A warning rather than a stop: everything up to step 5 is worth doing on a
     machine that will never build the image. */
  const docker = await resolveDocker({ interactive: false });
  if (docker.ok) ok(`Docker daemon ${docker.version}`);
  else note("Not needed until step 6, and this will ask again there.");

  saveAnswers(answers);
  return answers;
}

/**
 * Ask AWS whether it will sell what the stack is about to ask for.
 *
 * The configuration is read out of the synthesised template rather than
 * restated here, so this cannot agree with itself while disagreeing with
 * `site-stack.ts` — which is precisely the failure being checked for. The first
 * real deploy died ten minutes in on `Cannot find version 17.2 for postgres`.
 */
async function checkDatabaseIsOrderable(answers) {
  /* Captured rather than inherited: `cdk synth` writes the template even when it
     also complains (a missing hosted-zone context, say), and the complaint on
     screen here reads as the deploy having failed when nothing has started. */
  const synth = cdk(["synth", SITE_STACK, ...cdkContext(answers), "--quiet"], {
    mutates: false,
    capture: true,
    allowFail: true,
  });
  const templatePath = join(INFRA, "cdk.out", `${SITE_STACK}.template.json`);
  if (!existsSync(templatePath)) {
    warn("`cdk synth` produced no template, so the database cannot be checked before the deploy.");
    if (synth.stderr) note(synth.stderr.trim().split("\n").slice(-3).join(" "));
    return;
  }
  const config = readRdsConfig(JSON.parse(readFileSync(templatePath, "utf8")));
  if (!config) {
    skip("no database in the template");
    return;
  }

  /* No `--engine-version` when the stack pins only a major one.

     The version fix made `EngineVersion` render as `"17"`, which is exactly what
     RDS wants for a create — but `describe-orderable-db-instance-options` will
     not take a major version as a *filter*, so passing it turned this check into
     a silent no-op on the first run that used it. Ask for every version offered
     on the instance class instead, and let `checkOrderable` do the matching. */
  const pinsMinor = config.engineVersion.includes(".");
  const offered = aws(
    [
      "rds", "describe-orderable-db-instance-options",
      "--engine", config.engine,
      ...(pinsMinor ? ["--engine-version", config.engineVersion] : []),
      "--db-instance-class", config.instanceClass,
    ],
    { mutates: false },
  );
  if (offered === null || offered.dryRun) {
    warn("Could not check the database configuration against RDS, so the deploy will find out.");
    if (lastAwsError) {
      for (const line of lastAwsError.split("\n").slice(0, 3)) note(line);
    }
    note("Not fatal — but this is the check that catches a CREATE_FAILED ten minutes in.");
    return;
  }

  const all = offered.OrderableDBInstanceOptions ?? [];
  const problems = checkOrderable(config, all);
  if (problems.length === 0) {
    const minors = [...new Set(all
      .filter((o) => matchesEngineVersion(config.engineVersion, o?.EngineVersion))
      .map((o) => o.EngineVersion))].sort();
    ok(`${config.engine} ${config.engineVersion} on ${config.instanceClass} is available here`);
    if (minors.length > 0) note(`RDS offers ${minors.join(", ")} — it will use its default`);
    if (config.multiAz) note("Multi-AZ and Performance Insights both supported on that class");
    return;
  }
  out();
  out(red("✗ The stack asks RDS for something it does not offer in this region."));
  note("Every one of these is a CREATE_FAILED ten minutes into a 25-minute deploy.");
  for (const p of problems) {
    out(`  ${red("·")} ${bold(p.what)} — ${p.why}`);
    out(`      change: ${p.fix}`);
  }
  const versions = aws(
    ["rds", "describe-db-engine-versions", "--engine", config.engine, "--query",
      "DBEngineVersions[].EngineVersion"],
    { mutates: false },
  );
  if (Array.isArray(versions)) note(`available ${config.engine} versions: ${versions.join(", ")}`);
  out();
  process.exit(1);
}

/* ==========================================================================
   Step 2 — bootstrap
   ========================================================================== */

async function bootstrap(answers) {
  heading(2, "Bootstrap CDK in this account and region");
  if (stackStatus("CDKToolkit")) {
    skip("CDKToolkit already exists");
    return;
  }
  note("Once per account and region. Creates the asset bucket and the deploy roles.");
  cdk(["bootstrap", `aws://${answers.account}/${REGION}`]);
  ok("bootstrapped");
}

/* ==========================================================================
   Step 3 — clear up after a failed create
   ========================================================================== */

/**
 * The step the first run needed and the runbook did not have.
 *
 * A stack in `ROLLBACK_COMPLETE` cannot be updated — it must be deleted. And
 * deleting it is what exposes two resources that *survive* the delete and then
 * collide on the next create, with errors that do not mention the rollback:
 *
 * - the ECR repository carries `removalPolicy: RETAIN` and a fixed name; and
 * - CloudFormation deletes a Secrets Manager secret with a recovery window, so
 *   the name is taken for another thirty days.
 */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** What CloudFormation is working on right now, for a stack mid-operation. */
function currentlyBusyWith(name) {
  const events = aws(
    ["cloudformation", "describe-stack-events", "--stack-name", name, "--max-items", "20"],
    { mutates: false },
  );
  const event = (events?.StackEvents ?? []).find(
    (e) => e.ResourceStatus?.endsWith("_IN_PROGRESS") && e.ResourceType !== "AWS::CloudFormation::Stack",
  );
  return event ? `${event.ResourceStatus} ${event.LogicalResourceId} (${event.ResourceType})` : null;
}

/**
 * Sit with a stack that is mid-operation until it settles.
 *
 * Bouncing somebody out with "wait and run again" is a poor answer to a state
 * this script produces itself: a rollback of the site stack deletes a NAT
 * gateway and an RDS instance and takes ten to twenty minutes, and it is exactly
 * what somebody re-running this will meet. It is also the moment to say the
 * reassuring thing, because it is true and not obvious — CloudFormation is doing
 * the work server-side, so it continues whether or not any terminal stays open.
 */
async function waitForStackToSettle(name, status) {
  warn(`${name} is ${bold(status)} — something is already in flight.`);
  const busy = currentlyBusyWith(name);
  if (busy) note(`currently: ${busy}`);
  note("CloudFormation is doing this server-side. It carries on whether or not a terminal");
  note("stays open, so a window that closed mid-deploy has not left anything half-done.");
  if (/ROLLBACK|DELETE/.test(status)) {
    note("A rollback here deletes a NAT gateway and an RDS instance: ten to twenty minutes.");
  }

  if (DRY) {
    skip("would wait for it to settle");
    return status;
  }
  if (!(await confirm("Wait for it to finish?", true))) {
    stop(
      `Nothing can be done to ${name} while it is ${status}.`,
      "Run this again once it has settled — two deploys racing each other is how a stack",
      "reaches a state a script cannot fix.",
    );
  }

  const startedAt = Date.now();
  for (let attempt = 0; attempt < 160; attempt += 1) {
    await sleep(15_000);
    const now = stackStatus(name);
    // No stack at all: the rollback took it with it, which is a clean slate.
    if (!now) {
      ok(`${name} is gone — nothing left to clean up`);
      return undefined;
    }
    if (!now.endsWith("_IN_PROGRESS")) {
      ok(`settled at ${now} after ${Math.round((Date.now() - startedAt) / 60_000)} min`);
      return now;
    }
    if (attempt % 4 === 3) {
      const doing = currentlyBusyWith(name);
      note(`${Math.round((Date.now() - startedAt) / 60_000)} min — ${doing ?? now}`);
    }
  }
  stop(
    `${name} has been ${status} for forty minutes.`,
    "That is longer than this stack's slowest resource, so look at what it is stuck on:",
    `  aws cloudformation describe-stack-events --stack-name ${name} --region ${REGION} \\`,
    `    --max-items 20 --query 'StackEvents[].[Timestamp,ResourceStatus,LogicalResourceId]' --output table`,
  );
}

async function recoverFailedStack(answers) {
  heading(3, "Check for a failed earlier attempt");

  let status = stackStatus(SITE_STACK);
  if (stackAction(status) === "wait") status = await waitForStackToSettle(SITE_STACK, status);

  const action = stackAction(status);

  /* A live stack owns the repository and the secret. Offering to delete either
     would be offering to break a running service, so this path touches nothing. */
  if (action === "update") {
    skip(`${SITE_STACK} is ${status}`);
    return;
  }

  if (action === "create") {
    skip(status ? `${SITE_STACK} is ${status}` : `${SITE_STACK} does not exist yet`);
    /* And then check anyway.

       These two used to run only on the `recreate` path — the one where this
       script deletes the stack itself. That premise was wrong: the names outlive
       a stack delete *however it happened*, including a `delete-stack` typed by
       hand, which is exactly what somebody does after this script hands back a
       ROLLBACK_FAILED. The result was a create that died on

           [AWS::EarlyValidation::ResourceExistenceCheck]

       with the two functions written for that condition sitting unreached. */
    await clearRetainedRepository();
    await clearSecretPendingDeletion(answers);
    return;
  }
  if (action === "wait") {
    // Only reachable from a dry run, which does not actually wait.
    skip("still in flight");
    return;
  }
  if (action === "manual") {
    /* Deliberately not automated. Everything below deletes a database, and a
       script that decides that for itself is a script that will one day decide
       it about a database somebody's plans are in. But the shape is known well
       enough to say what is almost certainly wrong and what to type. */
    out();
    out(red(`✗ ${SITE_STACK} is ${status}.`));
    note("A failed rollback needs a decision about what to keep, so this one is yours.");
    out();
    out("  Most likely cause, if DELETE_FAILED names the data subnets or the database");
    out("  security group: the database was RETAINed, and its network interfaces are");
    out("  still holding those subnets. Confirm, then clear it:");
    out();
    out(`    aws cloudformation describe-stack-events --stack-name ${SITE_STACK} --region ${REGION} \\`);
    out("      --query 'StackEvents[?ResourceStatus==`DELETE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \\");
    out("      --output table");
    out();
    out(`    aws rds describe-db-instances --region ${REGION} \\`);
    out("      --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus,DeletionProtection]' --output table");
    out();
    out("  A database from a create that never completed holds nothing — no migration has");
    out(`  run against it. Read the identifier back before deleting it, then:`);
    out();
    out(`    aws rds modify-db-instance --region ${REGION} --db-instance-identifier "$ID" \\`);
    out("      --no-deletion-protection --apply-immediately");
    out(`    aws rds delete-db-instance --region ${REGION} --db-instance-identifier "$ID" \\`);
    out("      --skip-final-snapshot --delete-automated-backups");
    out(`    aws rds wait db-instance-deleted --region ${REGION} --db-instance-identifier "$ID"`);
    out();
    out(`    aws cloudformation delete-stack --stack-name ${SITE_STACK} --region ${REGION}`);
    out();
    note("Then run this again. A bootstrap deploy no longer retains or protects the");
    note("database, so a first create that fails rolls back cleanly from here on.");
    out();
    closeInput();
    process.exit(1);
  }

  warn(`${SITE_STACK} is ${bold(status)} and cannot be updated. It has to be deleted first.`);
  note("Nothing in it is holding data: the database never finished being created.");
  if (!(await confirm(`Delete the ${SITE_STACK} stack?`, true))) {
    stop("Nothing to do while the stack is in that state.");
  }

  aws(["cloudformation", "delete-stack", "--stack-name", SITE_STACK]);
  out(`    ${dim("waiting for the delete to finish…")}`);
  run("aws", ["cloudformation", "wait", "stack-delete-complete", "--stack-name", SITE_STACK,
    "--region", REGION]);
  ok("deleted");

  await clearRetainedRepository();
  await clearSecretPendingDeletion(answers);
}

async function clearRetainedRepository() {
  const found = aws(["ecr", "describe-repositories", "--repository-names", ECR_REPOSITORY], {
    mutates: false,
  });
  if (!found?.repositories?.length) {
    skip(`no leftover ECR repository ${ECR_REPOSITORY}`);
    return;
  }

  const images = aws(["ecr", "list-images", "--repository-name", ECR_REPOSITORY], { mutates: false });
  const count = images?.imageIds?.length ?? 0;
  warn(
    `The ECR repository ${bold(ECR_REPOSITORY)} is left over from an earlier stack ` +
      `(removalPolicy: RETAIN) and holds ${count} image${count === 1 ? "" : "s"}.`,
  );
  note("Its name is fixed, so creating the stack fails on the name unless it goes —");
  note("as [AWS::EarlyValidation::ResourceExistenceCheck], which names no resource.");
  if (count > 0) {
    note("Deleting it deletes those images. They can be rebuilt and pushed; nothing else uses them.");
  }
  if (!(await confirm(`Delete the ${ECR_REPOSITORY} repository?`, true))) {
    stop(
      "The next create will fail on the repository name.",
      "Either delete it, or give the repository a different name in infra/lib/site-stack.ts.",
    );
  }
  aws([
    "ecr", "delete-repository", "--repository-name", ECR_REPOSITORY,
    ...(count > 0 ? ["--force"] : []),
  ]);
  ok("repository deleted");
}

async function clearSecretPendingDeletion(answers) {
  const name = `${answers.domainName}/app`;
  const secret = aws(["secretsmanager", "describe-secret", "--secret-id", name], { mutates: false });
  if (!secret?.Name) {
    skip(`no leftover secret ${name}`);
    return;
  }
  if (!secret.DeletedDate) {
    skip(`secret ${name} exists and is healthy`);
    return;
  }

  warn(`The secret ${bold(name)} is scheduled for deletion, which keeps the name reserved.`);
  note("A recovery window of up to thirty days holds the name, so creating the stack fails");
  note("until it is released — and the failure names no resource either.");
  if (!(await confirm("Restore and hard-delete it so the name is free?", true))) {
    stop("The next create will fail on the secret name.");
  }
  aws(["secretsmanager", "restore-secret", "--secret-id", name]);
  aws([
    "secretsmanager", "delete-secret", "--secret-id", name, "--force-delete-without-recovery",
  ]);
  ok("secret name freed");
}

/* ==========================================================================
   Step 4 — create the infrastructure
   ========================================================================== */

async function createInfrastructure(answers) {
  heading(4, "Create the certificate and the site");

  if (stackAction(stackStatus(SITE_STACK)) === "update" && stackStatus(CERT_STACK)) {
    skip("both stacks exist");
    return;
  }

  note("First run takes about 25 minutes — most of it RDS and CloudFront.");
  note("The service is created wanting zero tasks, because the image it would run does");
  note("not exist yet: this stack creates the repository. Step 6 pushes one and raises it.");

  /* `allowFail` so the one failure worth explaining can be explained. CDK reports
     it as `[AWS::EarlyValidation::ResourceExistenceCheck]`, which names no
     resource, and advises DescribeEvents on a stack that may not exist. */
  const deployed = cdk(
    ["deploy", CERT_STACK, SITE_STACK, ...cdkContext(answers),
      "--context", `imageTag=${BOOTSTRAP_TAG}`, "--require-approval", "never"],
    { allowFail: true },
  );
  if (deployed.status !== 0 && !deployed.dryRun) {
    out();
    out(red("✗ The stacks did not deploy."));
    note("Something whose name is fixed already exists. This stack names exactly two:");
    note(`  the ECR repository ${bold(ECR_REPOSITORY)}`);
    note(`  the secret ${bold(`${answers.domainName}/app`)}`);
    note("Both outlive a stack delete. Run this again — step 3 offers to clear them, and a");
    note("failed change set also parks an empty stack in REVIEW_IN_PROGRESS that has to go.");
    out();
    closeInput();
    process.exit(1);
  }
  ok("stacks deployed");
}

/* ==========================================================================
   Step 5 — the application secret
   ========================================================================== */

/**
 * The four values the container reads out of Secrets Manager.
 *
 * The stack creates the secret empty on purpose: a value passed through CDK
 * lands in CloudFormation's event history and in every `cdk diff` anybody runs
 * afterwards. So it is filled here, out of band, and never written to disk.
 */
async function fillSecret(answers, outputs) {
  heading(5, "Fill in the application secrets");

  const name = `${answers.domainName}/app`;
  const current = aws(["secretsmanager", "get-secret-value", "--secret-id", name], {
    mutates: false,
  });
  let existing = {};
  try {
    existing = current?.SecretString ? JSON.parse(current.SecretString) : {};
  } catch {
    existing = {};
  }
  const filled = SECRET_KEYS.filter(
    (k) => typeof existing[k] === "string" && !isWebhookPlaceholder(existing[k]),
  );
  if (filled.length === SECRET_KEYS.length) {
    ok("the secret already holds all four keys");
    if (!(await confirm("Replace them?", false))) return existing;
  } else if (filled.length > 0) {
    note(`already set: ${filled.join(", ")}`);
  }

  out();
  note("These are never written to disk. They go straight to Secrets Manager.");
  note(`DATABASE_URL is not among them — it comes from the RDS-managed secret's uri field.`);
  note(
    `NODE_ENV, NEXT_PUBLIC_SITE_URL, BETTER_AUTH_URL and CHROMIUM_EXECUTABLE_PATH are set by`,
  );
  note(`CDK from the domain, so there is nothing to answer for them.`);
  out();

  const values = {};

  /* BETTER_AUTH_SECRET — generated by default. `openssl rand -base64 48`
     without openssl, which the runbook used to require. */
  if (await confirm("Generate BETTER_AUTH_SECRET for me?", true)) {
    values.BETTER_AUTH_SECRET = generateAuthSecret();
    ok("generated (48 random bytes, base64)");
  } else {
    values.BETTER_AUTH_SECRET = await ask("BETTER_AUTH_SECRET", {
      hidden: true,
      validate: (v) => validateSecretValue("BETTER_AUTH_SECRET", v),
    });
  }

  note("Stripe → Developers → API keys. Test mode is fine to start.");
  values.STRIPE_SECRET_KEY = await ask("STRIPE_SECRET_KEY", {
    hidden: true,
    validate: (v) => validateSecretValue("STRIPE_SECRET_KEY", v),
  });
  if (values.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
    warn("That is a live key. Real cards will be charged the moment checkout works.");
    if (!(await confirm("Continue with the live key?", false))) {
      values.STRIPE_SECRET_KEY = await ask("STRIPE_SECRET_KEY", {
        hidden: true,
        validate: (v) => validateSecretValue("STRIPE_SECRET_KEY", v),
      });
    }
  }

  /* The webhook secret cannot exist yet: Stripe issues it when the endpoint is
     created against the live URL, and the site has to be up for that. So a
     marked placeholder goes in now and step 8 replaces it. The app refuses to
     boot without *a* value, which is why this cannot simply be left out. */
  values.STRIPE_WEBHOOK_SECRET = existing.STRIPE_WEBHOOK_SECRET ?? WEBHOOK_PLACEHOLDER;
  if (isWebhookPlaceholder(values.STRIPE_WEBHOOK_SECRET)) {
    note("STRIPE_WEBHOOK_SECRET gets a placeholder for now — Stripe only issues the real one");
    note("once the endpoint exists, and the endpoint needs the URL this deploy is creating.");
  }

  note("ANTHROPIC_API_KEY may be left empty: the product then composes prose deterministically");
  note("from figures the engine computed, which is a real mode and what the tests run against.");
  values.ANTHROPIC_API_KEY = await ask("ANTHROPIC_API_KEY", {
    hidden: true,
    optional: true,
    fallback: "",
    validate: (v) => validateSecretValue("ANTHROPIC_API_KEY", v),
  });

  const secretId = outputs.AppSecretArn ?? name;
  aws(["secretsmanager", "put-secret-value", "--secret-id", secretId,
    "--secret-string", buildSecretString(values)]);
  ok(`wrote ${SECRET_KEYS.length} keys to ${name}`);
  for (const key of SECRET_KEYS) {
    const value = values[key];
    const shown = value === ""
      ? dim("(empty — deterministic generator)")
      : isWebhookPlaceholder(value)
        ? yellow("(placeholder — replaced in step 8)")
        : dim(`${value.slice(0, 8)}…`);
    note(`${key.padEnd(23)} ${shown}`);
  }
  if (OPTIONAL_SECRET_KEYS.some((k) => values[k] === "")) {
    note("Change any of these later with `aws secretsmanager put-secret-value`, then force a new");
    note("deployment so the running tasks pick it up.");
  }
  return values;
}

/* ==========================================================================
   Step 6 — the image
   ========================================================================== */

async function pushImage(answers, outputs) {
  heading(6, "Build and push the application image");

  if (STACK_ONLY) {
    /* The tag already deployed, so the service keeps the image it has and only
       the template changes. Read from the stack rather than from `.deploy.json`,
       which records what this script last pushed and not what is running. */
    const running = imageTagInUse(outputs) ?? answers.lastImageTag;
    if (!running) {
      stop(
        "--stack-only needs the tag the service is already running, and none was found.",
        "Drop the flag and let step 6 build one.",
      );
    }
    skip(`keeping the image already deployed: ${running}`);
    cdk(["deploy", SITE_STACK, ...cdkContext(answers), "--context", `imageTag=${running}`,
      "--require-approval", "never"]);
    ok("stack redeployed");
    return;
  }

  const registry = `${answers.account}.dkr.ecr.${REGION}.amazonaws.com`;
  const repositoryUri = outputs.EcrRepositoryUri ?? `${registry}/${ECR_REPOSITORY}`;
  const sha = run("git", ["rev-parse", "--short", "HEAD"], { mutates: false, capture: true,
    allowFail: true });
  const tag = await ask("Image tag", {
    fallback: (sha.stdout || "").trim() || answers.lastImageTag || "first",
  });
  answers.lastImageTag = tag;

  const docker = await resolveDocker();
  if (!docker.ok && !DRY) {
    stop(
      "Docker cannot be reached, so the image cannot be built.",
      "Everything before this step is done and saved; fix Docker and run:",
      "  node scripts/deploy.mjs --from=6",
    );
  }
  if (docker.ok) ok(`Docker daemon ${docker.version}`);

  const login = run("aws", ["ecr", "get-login-password", "--region", REGION],
    { mutates: false, capture: true, allowFail: true });
  if (login.status !== 0) stop("Could not get an ECR login token.");
  if (!DRY) {
    const piped = spawnSync(DOCKER[0],
      [...DOCKER.slice(1), "login", "--username", "AWS", "--password-stdin", registry],
      { input: login.stdout, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] });
    if (piped.status !== 0) stop("`docker login` to ECR failed.");
  } else {
    out(`    ${dim("would run:")} aws ecr get-login-password | ${DOCKER.join(" ")} login --password-stdin ${registry}`);
  }
  ok("logged in to ECR");

  /* `--platform linux/amd64` is not optional. The task definition pins
     X86_64, and an image built on an Apple Silicon machine without this runs
     as arm64 and the container dies with `exec format error` — which looks
     like an application fault and is not one. */
  run(DOCKER[0], [...DOCKER.slice(1), "build", "--platform", "linux/amd64",
    "--build-arg", `NEXT_PUBLIC_SITE_URL=https://${answers.domainName}`,
    "-t", `${repositoryUri}:${tag}`, "."]);
  run(DOCKER[0], [...DOCKER.slice(1), "push", `${repositoryUri}:${tag}`]);
  ok(`pushed ${repositoryUri}:${tag}`);

  cdk(["deploy", SITE_STACK, ...cdkContext(answers), "--context", `imageTag=${tag}`,
    "--require-approval", "never"]);
  ok("service pointed at the new image");
  saveAnswers(answers);
}

/* ==========================================================================
   Step 7 — wait for it to actually serve
   ========================================================================== */

/** The image tag the service is actually running, from its task definition. */
function imageTagInUse(outputs) {
  if (!outputs.ClusterName || !outputs.ServiceName) return null;
  const service = aws(
    ["ecs", "describe-services", "--cluster", outputs.ClusterName, "--services", outputs.ServiceName],
    { mutates: false },
  );
  const arn = service?.services?.[0]?.taskDefinition;
  if (!arn) return null;
  const described = aws(["ecs", "describe-task-definition", "--task-definition", arn], {
    mutates: false,
  });
  const image = described?.taskDefinition?.containerDefinitions?.[0]?.image;
  const tag = typeof image === "string" ? image.split(":").pop() : null;
  return tag && tag !== BOOTSTRAP_TAG ? tag : null;
}

async function waitForHealth(answers, outputs) {
  heading(7, "Wait for the service to come up");

  if (outputs.ClusterName && outputs.ServiceName) {
    out(`    ${dim("waiting for the ECS service to stabilise (this can take a few minutes)…")}`);
    note("First time through, the tasks are starting rather than restarting: the image is");
    note("pulled, the migrations run, and only then does the container bind a port.");
    const waited = run("aws", ["ecs", "wait", "services-stable", "--cluster", outputs.ClusterName,
      "--services", outputs.ServiceName, "--region", REGION], { allowFail: true });
    if (waited.status === 0) ok("service stable");
    else {
      warn("The service did not stabilise. The container's own logs say why:");
      note(`aws logs tail /aws/ecs/... --follow --region ${REGION}`);
      note("The three failures this project has already hit all announced themselves there:");
      note("a missing migration, a Prisma adapter mismatch, and a missing @prisma/config.");
    }
  }

  const url = outputs.SiteUrl ?? `https://${answers.domainName}`;
  if (DRY) {
    out(`    ${dim("would poll:")} ${url}/api/health`);
    return;
  }
  out(`    ${dim(`polling ${url}/api/health`)}`);
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(10_000) });
      const body = await response.text();
      if (response.ok && body.includes('"ok":true')) {
        ok(`${url}/api/health → ${body.trim()}`);
        return;
      }
      if (attempt % 5 === 0) note(`attempt ${attempt}: ${response.status} ${body.slice(0, 80)}`);
    } catch (error) {
      if (attempt % 5 === 0) note(`attempt ${attempt}: ${error.message}`);
    }
    await sleep(15_000);
  }
  warn(`${url}/api/health has not answered yet.`);
  note("DNS and CloudFront both take a few minutes on a first deploy. Try the distribution");
  note(`domain directly to rule DNS out: https://${outputs.DistributionDomain ?? "…"}/api/health`);
}

/* ==========================================================================
   Step 8 — the Stripe webhook
   ========================================================================== */

/**
 * The second half of the chicken-and-egg, and the step that decides whether
 * this deploy can take money.
 *
 * `/api/stripe/webhook` is the only code that grants an entitlement — not the
 * page, not the redirect back from checkout. A deploy left on the placeholder
 * accepts payments and delivers nothing, so the script does not report success
 * while that value is in place.
 */
async function configureWebhook(answers, outputs, written) {
  heading(8, "Point Stripe at the webhook");

  const name = `${answers.domainName}/app`;
  /* Prefer what step 5 wrote in this same run. Reading it back would be a
     needless round trip, and in a dry run — where step 5 wrote nothing — it
     would report the secret as missing three keys it is about to have. */
  let secret = written ?? {};
  if (!written) {
    const current = aws(["secretsmanager", "get-secret-value", "--secret-id", name],
      { mutates: false });
    try {
      secret = current?.SecretString ? JSON.parse(current.SecretString) : {};
    } catch {
      secret = {};
    }
  }
  if (secret.STRIPE_WEBHOOK_SECRET && !isWebhookPlaceholder(secret.STRIPE_WEBHOOK_SECRET)) {
    skip("the webhook secret is already set");
    answers.webhookConfigured = true;
    saveAnswers(answers);
    return;
  }

  out();
  out(`  In the Stripe dashboard → Developers → Webhooks → Add endpoint:`);
  out();
  out(`    ${bold(`https://${answers.domainName}/api/stripe/webhook`)}`);
  out();
  out(`  Subscribe it to exactly these four events:`);
  for (const event of [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]) out(`    · ${event}`);
  out();
  note("Stripe shows the signing secret once, when the endpoint is created.");
  out();

  const whsec = await ask("STRIPE_WEBHOOK_SECRET", {
    hidden: true,
    validate: (v) => (isWebhookPlaceholder(v) ? "still the placeholder" :
      validateSecretValue("STRIPE_WEBHOOK_SECRET", v)),
  });

  const merged = { ...secret, STRIPE_WEBHOOK_SECRET: whsec };
  const incomplete = SECRET_KEYS.filter((k) => typeof merged[k] !== "string");
  if (incomplete.length > 0) {
    stop(
      `The secret is missing ${incomplete.join(", ")}, so it cannot be updated in place.`,
      "Re-run step 5 to write all four keys at once:",
      "  node scripts/deploy.mjs --from=5",
    );
  }
  for (const key of Object.keys(merged)) {
    if (!SECRET_KEYS.includes(key)) delete merged[key];
  }
  aws(["secretsmanager", "put-secret-value", "--secret-id", outputs.AppSecretArn ?? name,
    "--secret-string", buildSecretString(merged)]);
  ok("webhook secret stored");

  if (outputs.ClusterName && outputs.ServiceName) {
    /* A secret is read when the task starts, so the running tasks are still
       holding the placeholder until they are replaced. */
    aws(["ecs", "update-service", "--cluster", outputs.ClusterName,
      "--service", outputs.ServiceName, "--force-new-deployment"]);
    ok("forced a new deployment so the tasks pick it up");
  }
  answers.webhookConfigured = true;
  saveAnswers(answers);
}

/* ==========================================================================
   Step 9 — the GitHub deploy role
   ========================================================================== */

async function githubRole(answers) {
  heading(9, "GitHub deploy role (optional)");
  note("So CI never holds a long-lived AWS key. Skip it if you deploy from here.");
  if (!(await confirm("Create the OIDC provider and deploy role now?", false))) {
    skip("skipped — DEPLOY.md step 7 has the manual version");
    return;
  }

  answers.repoSlug = await ask("GitHub repository (owner/repo)", {
    fallback: answers.repoSlug ?? "dominicplouffe/businessplanner",
    validate: (v) => (/^[^/\s]+\/[^/\s]+$/.test(v) ? null : "expected owner/repo"),
  });
  const branch = await ask("Branch allowed to deploy", { fallback: "main" });

  const providerArn =
    `arn:aws:iam::${answers.account}:oidc-provider/token.actions.githubusercontent.com`;
  const existing = aws(["iam", "get-open-id-connect-provider",
    "--open-id-connect-provider-arn", providerArn], { mutates: false });
  if (existing?.Url) skip("OIDC provider already trusted");
  else {
    aws(["iam", "create-open-id-connect-provider",
      "--url", "https://token.actions.githubusercontent.com",
      "--client-id-list", "sts.amazonaws.com"]);
    ok("OIDC provider created");
  }

  /* The `sub` condition is the whole security of this arrangement: a wildcard
     there lets any repository on GitHub assume the role. */
  const trust = {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Federated: providerArn },
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        StringLike: {
          "token.actions.githubusercontent.com:sub":
            `repo:${answers.repoSlug}:ref:refs/heads/${branch}`,
        },
      },
    }],
  };

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AssumeTheCdkRoles",
        Effect: "Allow",
        Action: "sts:AssumeRole",
        Resource: `arn:aws:iam::${answers.account}:role/cdk-*`,
      },
      {
        Sid: "ReadTheBootstrapVersion",
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: `arn:aws:ssm:${REGION}:${answers.account}:parameter/cdk-bootstrap/*`,
      },
      { Sid: "EcrLogin", Effect: "Allow", Action: "ecr:GetAuthorizationToken", Resource: "*" },
      {
        Sid: "PushTheImage",
        Effect: "Allow",
        Action: [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:DescribeImages", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
        ],
        Resource: `arn:aws:ecr:${REGION}:${answers.account}:repository/${ECR_REPOSITORY}`,
      },
      {
        Sid: "WatchTheDeploy",
        Effect: "Allow",
        Action: [
          "cloudformation:DescribeStacks", "cloudformation:DescribeStackEvents",
          "ecs:DescribeServices", "ecs:DescribeTasks", "ecs:ListTasks", "ecs:UpdateService",
          "cloudfront:CreateInvalidation", "cloudfront:GetInvalidation",
        ],
        Resource: "*",
      },
    ],
  };

  const roleName = "VenturellyGitHubDeploy";
  if (aws(["iam", "get-role", "--role-name", roleName], { mutates: false })?.Role) {
    skip(`role ${roleName} already exists — updating its trust policy`);
    aws(["iam", "update-assume-role-policy", "--role-name", roleName,
      "--policy-document", JSON.stringify(trust)]);
  } else {
    aws(["iam", "create-role", "--role-name", roleName,
      "--description", `Deploys ${answers.repoSlug} from GitHub Actions`,
      "--assume-role-policy-document", JSON.stringify(trust)]);
    ok(`role ${roleName} created`);
  }
  aws(["iam", "put-role-policy", "--role-name", roleName,
    "--policy-name", "Deploy", "--policy-document", JSON.stringify(policy)]);
  ok("policy attached");

  out();
  out(`  Add this as the ${bold("AWS_DEPLOY_ROLE_ARN")} repository secret:`);
  out(`    ${bold(`arn:aws:iam::${answers.account}:role/${roleName}`)}`);
  note(`https://github.com/${answers.repoSlug}/settings/secrets/actions`);
  saveAnswers(answers);
}

/* ==========================================================================
   Step 10 — say what to check
   ========================================================================== */

function finish(answers, outputs) {
  const url = outputs.SiteUrl ?? `https://${answers.domainName}`;
  heading(10, "Done — what to check");
  out(`  ${green("●")} ${bold(url)}`);
  out();
  out("  Walk one purchase end to end with Stripe's test card 4242 4242 4242 4242:");
  out("    sign up → finish an intake → try to export (refuses with 402) → pay → export.");
  out("  `node tests/e2e/smoke.mjs` does exactly this against a local server, and is the");
  out("  script to copy from.");
  out();
  out(`  ${dim(`curl -sI ${url} | head -1`)}`);
  out(`  ${dim(`curl -s ${url}/api/health`)}`);
  out(`  ${dim(`curl -s ${url}/sitemap.xml | head -3`)}`);
  out();
  note("Answers were remembered in .deploy.json (no secrets). Re-run this any time;");
  note("every step checks whether it has already been done.");
  out();
  out("  Still owed before a real launch, from DEPLOY.md:");
  out("    · the legal documents have not been reviewed by counsel");
  out("    · the regulatory verification queue is unverified against primary sources");
  out("    · no email transport, and no error tracking");
  out();
}

/* ==========================================================================
   --destroy — take it all down
   ========================================================================== */

/**
 * Everything billable, gone, so an unused site costs about a dollar a month.
 *
 * `cdk destroy` cannot do this, and the way it fails is expensive. The
 * production database is RETAINed and deletion-protected, so CloudFormation
 * skips it — the one resource worth ~$50 a month keeps running. And its network
 * interfaces keep holding the data subnets and the database security group, so
 * the stack lands in DELETE_FAILED (the same shape as the ROLLBACK_FAILED in the
 * comment on `deletionProtection` in site-stack.ts). So the database goes first,
 * by hand, with a final snapshot unless told otherwise, and then the stack.
 *
 * Afterwards it clears what outlives a stack delete: the repository and secret
 * (fixed names, which would block the next create exactly as step 3 describes),
 * the CloudFront log bucket and the log groups.
 *
 * Kept: the hosted zone (the domain needs it), the certificate stack (free, and
 * keeping it skips DNS validation on the way back), the CDK bootstrap stack and
 * the GitHub deploy role (both free).
 *
 * Idempotent like the rest of this script: every delete checks first, so a run
 * that stops part-way is finished by running it again.
 */
async function destroy(answers) {
  out();
  out(bold("Tear down Venturelly on AWS"));
  if (DRY) out(yellow("  --dry-run: reads are performed, nothing is deleted."));

  heading(1, "Where");
  const cli = run("aws", ["--version"], { mutates: false, capture: true, allowFail: true });
  if (cli.status !== 0) stop("The AWS CLI is not installed.");
  REGION = await ask("AWS region", { fallback: answers.region ?? "us-east-1" });
  const identity = aws(["sts", "get-caller-identity"], { mutates: false });
  if (!identity?.Account) {
    stop("`aws sts get-caller-identity` did not return an account.", lastAwsError);
  }
  ok(`Account ${bold(identity.Account)} as ${dim(identity.Arn)}`);
  const domain = await ask("Domain", { fallback: answers.domainName ?? "getventurely.com" });
  const secretName = `${domain}/app`;

  heading(2, "What is there");

  let status = stackStatus(SITE_STACK);
  if (status && stackAction(status) === "wait") status = await waitForStackToSettle(SITE_STACK, status);

  const resources = status
    ? (aws(["cloudformation", "list-stack-resources", "--stack-name", SITE_STACK], { mutates: false })
        ?.StackResourceSummaries ?? []).filter((r) => r.ResourceStatus !== "DELETE_COMPLETE")
    : [];
  const physical = (type) =>
    resources.filter((r) => r.ResourceType === type && r.PhysicalResourceId).map((r) => r.PhysicalResourceId);

  const dbId = physical("AWS::RDS::DBInstance")[0];
  const db = dbId
    ? aws(["rds", "describe-db-instances", "--db-instance-identifier", dbId], { mutates: false })
        ?.DBInstances?.[0]
    : undefined;
  const subnetGroups = physical("AWS::RDS::DBSubnetGroup");
  const buckets = physical("AWS::S3::Bucket");
  const repository = aws(["ecr", "describe-repositories", "--repository-names", ECR_REPOSITORY],
    { mutates: false })?.repositories?.[0];
  const secret = aws(["secretsmanager", "describe-secret", "--secret-id", secretName], { mutates: false });
  const certStatus = stackStatus(CERT_STACK);

  if (!status && !db && !repository && !secret?.Name) {
    ok("nothing billable is left — the site is already down");
    closeInput();
    return;
  }

  out("  Will be deleted:");
  if (db) note(`· database ${db.DBInstanceIdentifier} (${db.DBInstanceClass}, ${db.DBInstanceStatus})`);
  if (status) {
    note(`· ${SITE_STACK} (${status}): VPC and NAT gateway, load balancer, ECS service,`);
    note(`  CloudFront, and the DNS records for ${domain}`);
  }
  if (repository) note(`· ECR repository ${ECR_REPOSITORY} and its images — rebuilt from git on the way back`);
  if (secret?.Name) note(`· secret ${secretName} — the Stripe and Anthropic keys are re-entered on the way back`);
  if (buckets.length) note(`· CloudFront log bucket${buckets.length > 1 ? "s" : ""} ${buckets.join(", ")}`);
  note("· the stack's CloudWatch log groups");
  out("  Kept:");
  note(`· the Route 53 hosted zone for ${domain} (~$0.50/month; the domain needs it)`);
  if (certStatus) note(`· ${CERT_STACK} — ACM certificates are free, and keeping it skips re-validation`);
  note("· the CDK bootstrap stack and the GitHub deploy role, both free");

  heading(3, "Confirm");
  let snapshotId;
  if (db) {
    note("A snapshot costs cents a month and is the only copy of every account and plan.");
    if (await confirm("Keep a final snapshot of the database?", true)) {
      snapshotId = finalSnapshotId();
      note(`snapshot: ${snapshotId}`);
    } else {
      warn("No snapshot: the database's contents are gone for good.");
    }
  }
  if (DRY) {
    skip(`would ask you to type ${domain} before deleting anything`);
  } else {
    const typed = await prompt(`  ${red("This cannot be undone.")} Type ${bold(domain)} to confirm: `);
    if (typed !== domain) stop("That did not match. Nothing was deleted.");
  }

  heading(4, "Delete the database");
  if (!db) {
    skip("no database");
  } else if (db.DBInstanceStatus !== "deleting") {
    if (db.DeletionProtection) {
      if (!aws(["rds", "modify-db-instance", "--db-instance-identifier", dbId,
        "--no-deletion-protection", "--apply-immediately"])) {
        stop(`Could not turn off deletion protection on ${dbId}.`, lastAwsError);
      }
      ok("deletion protection off");
    }
    const deleted = aws(["rds", "delete-db-instance", "--db-instance-identifier", dbId,
      ...(snapshotId ? ["--final-db-snapshot-identifier", snapshotId] : ["--skip-final-snapshot"]),
      "--delete-automated-backups"]);
    if (!deleted) stop(`Could not delete ${dbId}.`, lastAwsError);
  }
  if (db) {
    note("waiting for RDS to finish — usually five to fifteen minutes…");
    run("aws", ["rds", "wait", "db-instance-deleted", "--db-instance-identifier", dbId,
      "--region", REGION]);
    ok(snapshotId ? `database deleted, snapshot ${snapshotId} kept` : "database deleted");
    // Retained along with the instance. Harmless, but it is litter.
    for (const group of subnetGroups) {
      aws(["rds", "delete-db-subnet-group", "--db-subnet-group-name", group], { allowFail: true });
    }
  }

  heading(5, `Delete ${SITE_STACK}`);
  if (!status) {
    skip(`${SITE_STACK} does not exist`);
  } else {
    note("ten to twenty minutes; CloudFront is the slow part");
    aws(["cloudformation", "delete-stack", "--stack-name", SITE_STACK]);
    const waited = run("aws", ["cloudformation", "wait", "stack-delete-complete",
      "--stack-name", SITE_STACK, "--region", REGION], { allowFail: true });
    if (waited.status !== 0) {
      const events = aws(["cloudformation", "describe-stack-events", "--stack-name", SITE_STACK],
        { mutates: false });
      out();
      out(red(`✗ ${SITE_STACK} did not delete cleanly. What would not go:`));
      for (const e of (events?.StackEvents ?? []).filter((e) => e.ResourceStatus === "DELETE_FAILED")) {
        note(`${e.LogicalResourceId}: ${e.ResourceStatusReason ?? ""}`);
      }
      out();
      out(`  Fix that, then run ${bold("node scripts/deploy.mjs --destroy")} again — it picks up here.`);
      closeInput();
      process.exit(1);
    }
    ok(`${SITE_STACK} deleted`);
  }

  heading(6, "Clear what outlives the stack");
  if (repository) {
    aws(["ecr", "delete-repository", "--repository-name", ECR_REPOSITORY, "--force"]);
    ok(`repository ${ECR_REPOSITORY} deleted`);
  }
  /* Read again rather than trusting the earlier answer: CloudFormation may have
     removed it outright, or left it in a recovery window that holds the name. */
  const leftover = aws(["secretsmanager", "describe-secret", "--secret-id", secretName], { mutates: false });
  if (leftover?.Name) {
    if (leftover?.DeletedDate) aws(["secretsmanager", "restore-secret", "--secret-id", secretName]);
    aws(["secretsmanager", "delete-secret", "--secret-id", secretName, "--force-delete-without-recovery"]);
    ok(`secret ${secretName} deleted, name freed for the next deploy`);
  }
  for (const bucket of buckets) {
    if (run("aws", ["s3api", "head-bucket", "--bucket", bucket], { mutates: false, capture: true,
      allowFail: true }).status === 0) {
      run("aws", ["s3", "rb", `s3://${bucket}`, "--force", "--region", REGION], { capture: true });
      ok(`bucket ${bucket} deleted`);
    }
  }
  const groups = aws(["logs", "describe-log-groups", "--log-group-name-pattern", SITE_STACK],
    { mutates: false })?.logGroups ?? [];
  for (const group of groups) {
    aws(["logs", "delete-log-group", "--log-group-name", group.logGroupName], { allowFail: true });
  }
  if (groups.length) ok(`${groups.length} log group${groups.length > 1 ? "s" : ""} deleted`);

  saveAnswers(answersAfterTeardown({ ...answers, region: REGION, domainName: domain }));

  out();
  out(bold(DRY ? "Dry run done — nothing was deleted." : `Done. Nothing billable is left running for ${domain}.`));
  if (snapshotId) {
    note(`The snapshot is kept until you delete it:`);
    note(`  aws rds delete-db-snapshot --region ${REGION} --db-snapshot-identifier ${snapshotId}`);
  }
  if (certStatus) {
    note(`To remove the certificate as well:`);
    note(`  aws cloudformation delete-stack --region us-east-1 --stack-name ${CERT_STACK}`);
  }
  out();
  out("  Coming back:");
  note("· `node scripts/deploy.mjs` rebuilds everything. It asks for the Stripe and Anthropic");
  note("  keys again, and the database starts empty — restoring the snapshot is not automated.");
  note(`· The Stripe webhook endpoint still points at ${domain}. Disable it in the dashboard`);
  note("  while the site is down; on the way back, step 8 asks for its signing secret again.");
  out();
  closeInput();
}

/* ========================================================================== */

async function main() {
  if (DESTROY) return destroy(loadAnswers());

  out();
  out(bold("Deploy Venturelly to AWS"));
  if (DRY) out(yellow("  --dry-run: reads are performed, nothing is written."));
  if (FROM > 1) {
    out(dim(`  resuming at step ${FROM}; preflight always runs, using the answers already saved`));
  }

  const answers = loadAnswers();
  const only = (n, fn) => (FROM <= n ? fn() : Promise.resolve(skip(`step ${n} skipped`)));

  await preflight(answers);
  await only(2, () => bootstrap(answers));
  await only(3, () => recoverFailedStack(answers));
  await only(4, () => createInfrastructure(answers));

  const outputs = stackOutputs(SITE_STACK);
  if (!DRY && !outputs.AppSecretArn) {
    stop(
      `${SITE_STACK} produced no outputs, so the steps below have nothing to act on.`,
      "Look at what CloudFormation says went wrong:",
      `  aws cloudformation describe-stack-events --stack-name ${SITE_STACK} --region ${REGION} \\`,
      `    --query 'StackEvents[?ResourceStatus==\`CREATE_FAILED\`].[LogicalResourceId,ResourceStatusReason]'`,
    );
  }

  /* Held only for the length of this run, and only so step 8 can update the
     secret in place without reading it back. Never written anywhere. */
  let written = null;

  await only(5, async () => {
    written = await fillSecret(answers, outputs);
  });
  await only(6, () => pushImage(answers, outputs));
  await only(7, () => waitForHealth(answers, outputs));
  await only(8, () => configureWebhook(answers, outputs, written));
  await only(9, () => githubRole(answers));
  finish(answers, outputs);
  closeInput();
}

main().catch((error) => {
  closeInput();
  stop(error?.message ?? String(error));
});
