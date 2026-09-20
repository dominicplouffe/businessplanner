import { Stack, StackProps, CfnOutput, aws_certificatemanager as acm, aws_route53 as route53 } from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * The edge certificate, alone in us-east-1.
 *
 * CloudFront accepts a certificate from that region and no other, whatever
 * region everything else runs in. It gets its own stack rather than a
 * cross-region custom resource because the deprecated alternative leaves a
 * Lambda behind that nobody remembers owning.
 */
/**
 * The zone, named or looked up.
 *
 * `fromLookup` is a context provider: it needs credentials, a concrete account
 * and region, and a zone that already exists. When the zone is missing it does
 * not fail — it returns a dummy value and lets the deploy run until
 * certificate validation hangs with nothing to explain it. Naming the id skips
 * all of that, and is what lets `cdk synth` run with no AWS access at all.
 */
function resolveZone(
  scope: Construct,
  domainName: string,
  hostedZoneId?: string,
): route53.IHostedZone {
  return hostedZoneId
    ? route53.HostedZone.fromHostedZoneAttributes(scope, "Zone", { hostedZoneId, zoneName: domainName })
    : route53.HostedZone.fromLookup(scope, "Zone", { domainName });
}

export class CertificateStack extends Stack {
  readonly certificateArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { domainName: string; hostedZoneId?: string },
  ) {
    super(scope, id, props);

    const zone = resolveZone(this, props.domainName, props.hostedZoneId);

    const certificate = new acm.Certificate(this, "EdgeCertificate", {
      domainName: props.domainName,
      subjectAlternativeNames: [`www.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    this.certificateArn = certificate.certificateArn;
    new CfnOutput(this, "CertificateArn", { value: certificate.certificateArn });
  }
}
