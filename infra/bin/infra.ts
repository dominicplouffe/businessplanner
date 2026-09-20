#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { SiteStack } from "../lib/site-stack";
import { CertificateStack } from "../lib/certificate-stack";

/* Two stacks, because CloudFront's certificate has to live in us-east-1 and
   nothing else should be forced there with it. `crossRegionReferences` lets the
   main stack read the ARN without a hand-copied value. */

const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";
const domainName = app.node.tryGetContext("domainName") ?? process.env.DOMAIN_NAME ?? "getventurely.com";
const imageTag = app.node.tryGetContext("imageTag") ?? process.env.IMAGE_TAG ?? "latest";

const certificate = new CertificateStack(app, "VenturallyCertificate", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName,
});

new SiteStack(app, "VenturallySite", {
  // A hosted-zone lookup needs a concrete account and region — an
  // environment-agnostic stack cannot do it, and the failure is confusing.
  env: { account, region },
  crossRegionReferences: true,
  domainName,
  imageTag,
  edgeCertificateArn: certificate.certificateArn,
  production: (app.node.tryGetContext("production") ?? "true") !== "false",
});
