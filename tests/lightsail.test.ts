import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* ==========================================================================
   The Lightsail deployment's configuration.
   --------------------------------------------------------------------------
   `scripts/lightsail.sh` talks to AWS and a server and cannot run here. What
   it ships can be checked: the settings file the app boots from, the compose
   file, and the ignore files that keep the secrets out of git and the image.
   ========================================================================== */

const read = (path: string) => readFileSync(path, "utf8");

const example = read("deploy/env.production.example");
const script = read("scripts/lightsail.sh");
const compose = read("deploy/docker-compose.yml");

const exampleKeys = new Map(
  [...example.matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1]!, m[2]!] as const),
);

/** Every variable `src/lib/env.ts` reads, which is what the boot guard checks. */
const envReads = [...new Set([...read("src/lib/env.ts").matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]!))]
  .filter((name) => name !== "NODE_ENV");

describe("the production settings file", () => {
  it("names every variable the app reads at boot", () => {
    /* The app is the authority. A variable assertProductionEnv() requires and
       the template omits is a container that refuses to start on the server,
       which is the most expensive place to find out. */
    for (const name of envReads) expect(exampleKeys.has(name), name).toBe(true);
  });

  it("is checked by the script before anything is built", () => {
    const checked = script.match(/check_env\(\) \{[\s\S]*?for key in ([\s\S]*?); do/)![1]!;
    for (const name of envReads) expect(checked, name).toContain(name);
  });

  it("requires the certificate email, because Caddy will not start without it", () => {
    /* `email {$ACME_EMAIL}` with an empty value is a parse error, and Caddy
       rejects the whole file — the rehearsal crash-looped with nothing on 443.
       A warning there would be a deploy that serves no site. */
    const checked = script.match(/check_env\(\) \{[\s\S]*?for key in ([\s\S]*?); do/)![1]!;
    expect(checked).toContain("ACME_EMAIL");
    expect(read("deploy/Caddyfile")).toContain("email {$ACME_EMAIL}");
  });

  it("ships with no secret filled in", () => {
    for (const name of ["POSTGRES_PASSWORD", "DATABASE_URL", "BETTER_AUTH_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ANTHROPIC_API_KEY"]) {
      expect(exampleKeys.get(name), name).toBe("");
    }
  });

  it("carries live price ids, which the boot guard would otherwise refuse", () => {
    for (const name of ["STRIPE_PRICE_UNLOCK", "STRIPE_PRICE_LIVE"]) {
      expect(exampleKeys.get(name)).toMatch(/^price_(?!test_)/);
    }
  });

  it("builds a DATABASE_URL that points at the compose service", () => {
    expect(script).toContain("@postgres:5432/venturelly");
    expect(compose).toMatch(/^ {2}postgres:/m);
  });
});

describe("the compose file", () => {
  it("pins Postgres to a major version, never a minor", () => {
    const image = compose.match(/image: postgres:(\S+)/)![1]!;
    expect(image).toMatch(/^\d+-alpine$/);
  });

  it("binds the server to every interface", () => {
    /* The image's health check asks 127.0.0.1. A runtime-supplied HOSTNAME
       bound the server to one interface on ECS and the check was refused. */
    expect(compose).toMatch(/HOSTNAME: 0\.0\.0\.0/);
  });

  it("proxies to the port the image exposes", () => {
    const exposed = read("Dockerfile").match(/^EXPOSE (\d+)/m)![1]!;
    expect(read("deploy/Caddyfile")).toContain(`reverse_proxy web:${exposed}`);
  });
});

describe("keeping secrets where they belong", () => {
  it("never commits the settings file or a dump", () => {
    const ignored = read(".gitignore");
    expect(ignored).toContain("deploy/.env.production");
    expect(ignored).toContain("deploy/backups");
  });

  it("never bakes them into the image", () => {
    const ignored = read(".dockerignore");
    expect(ignored).toContain("deploy/.env*");
    expect(ignored).toContain("deploy/backups");
  });

  it("builds for the architecture the server runs", () => {
    expect(script).toContain("--platform linux/amd64");
  });
});
