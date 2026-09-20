#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { SiteStack } from "../lib/site-stack";
import { CertificateStack } from "../lib/certificate-stack";

/* Two stacks, because CloudFront's certificate has to live in us-east-1 and
   nothing else should be forced there with it. `crossRegionReferences` lets the
   main stack read the ARN without a hand-copied value. */

const app = new App();

/* The account has to be concrete before either stack is constructed.

   `CDK_DEFAULT_ACCOUNT` is set by the CDK CLI only when it can already resolve
   credentials. Left undefined it does not fail here — it makes the stacks
   environment-*agnostic*, so `stack.account` becomes an unresolved token and
   the hosted-zone lookup inside each stack throws seven hundred characters of
   minified aws-cdk-lib at somebody running their first command. The condition
   was always fatal; it just was not legible. */
const account =
  app.node.tryGetContext("account") ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  process.env.AWS_ACCOUNT_ID;

if (!account) {
  throw new Error(
    "No AWS account resolved, so the Route 53 lookup this app performs cannot run.\n" +
      "  1. Check your credentials:  aws sts get-caller-identity\n" +
      "  2. Then either:             export CDK_DEFAULT_ACCOUNT=<account-id>\n" +
      "     or pass:                 --context account=<account-id>\n" +
      "Both stacks need a concrete account and region — an environment-agnostic " +
      "stack cannot look a hosted zone up.",
  );
}

const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";
const domainName = app.node.tryGetContext("domainName") ?? process.env.DOMAIN_NAME ?? "getventurely.com";
const imageTag = app.node.tryGetContext("imageTag") ?? process.env.IMAGE_TAG ?? "latest";
/* Naming the zone skips the lookup entirely: no context provider, no round
   trip, no credentials. That is what makes a `cdk synth` possible in CI, and
   it avoids the quieter trap — `fromLookup` against a zone that does not exist
   yet returns a dummy value and lets the deploy proceed until certificate
   validation hangs with nothing to explain it. */
const hostedZoneId = app.node.tryGetContext("hostedZoneId") ?? process.env.HOSTED_ZONE_ID;

const certificate = new CertificateStack(app, "VenturellyCertificate", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName,
  hostedZoneId,
});

new SiteStack(app, "VenturellySite", {
  // A hosted-zone lookup needs a concrete account and region — an
  // environment-agnostic stack cannot do it, and the failure is confusing.
  env: { account, region },
  crossRegionReferences: true,
  domainName,
  hostedZoneId,
  imageTag,
  edgeCertificateArn: certificate.certificateArn,
  production: (app.node.tryGetContext("production") ?? "true") !== "false",
});
