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
export class CertificateStack extends Stack {
  readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: StackProps & { domainName: string }) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: props.domainName });

    const certificate = new acm.Certificate(this, "EdgeCertificate", {
      domainName: props.domainName,
      subjectAlternativeNames: [`www.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    this.certificateArn = certificate.certificateArn;
    new CfnOutput(this, "CertificateArn", { value: certificate.certificateArn });
  }
}
