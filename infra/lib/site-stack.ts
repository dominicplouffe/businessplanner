import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_rds as rds,
  aws_elasticloadbalancingv2 as elbv2,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_secretsmanager as secretsmanager,
  aws_logs as logs,
} from "aws-cdk-lib";
import { Construct } from "constructs";

/* ==========================================================================
   Venturelly, on AWS.
   --------------------------------------------------------------------------
   The original plan here was S3 and CloudFront serving a static export. That
   is no longer what this application is: it has authentication, a database,
   server actions, and a PDF pipeline that drives a real browser. So it runs as
   a container.

   CloudFront still fronts everything, because it was always going to: the
   certificate and the DNS records live there, static assets are cached at the
   edge, and the origin can be replaced without touching either.

   Two decisions worth stating, because both cost money in the obvious
   direction:

   - The tasks sit in private subnets behind NAT. A public subnet with a public
     IP would save the NAT gateway's monthly cost, but it puts the thing that
     renders customer plan content one security-group rule away from the
     internet.
   - The database is Multi-AZ. A single instance is half the price and turns
     an availability-zone failure into an outage with an RPO measured in
     whatever the last automated snapshot was.

   Both are `props` so a staging stack can choose differently.
   ========================================================================== */

/**
 * The tag the very first deploy uses, before there is any image to push.
 *
 * The ECR repository is created by this stack, so on a first deploy it is
 * necessarily empty — there is nowhere to have pushed to. That would be
 * harmless if CloudFormation treated a service with no running tasks as
 * created, but `AWS::ECS::Service` blocks until the service reaches steady
 * state, and the deployment circuit breaker fails it after a few launches that
 * cannot pull an image. The real failure, on the second attempt at a first
 * deploy:
 *
 *     CREATE_FAILED | AWS::ECS::Service | Service/Service
 *     "Error occurred during operation 'ECS Deployment Circuit Breaker was
 *      triggered'."
 *
 * — and with it a full rollback of twenty-five minutes of RDS and CloudFront.
 * So a bootstrap deploy asks for no tasks at all (see `desiredCount` below),
 * which reaches steady state at once. The second deploy, with a real tag and an
 * image behind it, is what raises the count.
 */
export const BOOTSTRAP_TAG = "bootstrap";

export type SiteStackProps = StackProps & {
  /** Apex domain. The hosted zone must already exist in this account. */
  domainName: string;
  /** The zone's id, when it is known. Given one, the stack skips the Route 53
   *  lookup — which is what lets it synthesise without AWS credentials. */
  hostedZoneId?: string;
  /** Tag of the image in ECR to run. The CI workflow passes the commit SHA;
   *  `BOOTSTRAP_TAG` means no image exists yet — see above. */
  imageTag: string;
  /** Smaller and cheaper for a staging stack. */
  production?: boolean;
  /** ARN of the certificate in us-east-1. CloudFront accepts one from no other
   *  region, so it is created by its own stack and passed in. */
  edgeCertificateArn: string;
};

export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const isProduction = props.production ?? true;
    const domainName = props.domainName;

    /* No image has been pushed yet, so nothing can be asked to run. */
    const bootstrapping = props.imageTag === BOOTSTRAP_TAG;

    /* ---- Network ------------------------------------------------------- */

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      // One NAT gateway rather than one per zone. A zone failure then costs
      // outbound connectivity for tasks in the other zone until they are
      // rescheduled, which is the right trade at this size.
      natGateways: isProduction ? 1 : 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    /* ---- Database ------------------------------------------------------ */

    const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
      description: "Venturelly Postgres credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "venturelly" }),
        generateStringKey: "password",
        // Postgres URLs are parsed before they are connected with, so a
        // password containing a delimiter produces a connection string that is
        // valid and points somewhere else.
        excludeCharacters: "/@\" '\\:?#[]%",
        passwordLength: 32,
      },
    });

    const database = new rds.DatabaseInstance(this, "Database", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      /* The major version only, deliberately.

         This was pinned to `VER_17_2` and the first deploy failed ten minutes
         in with `Cannot find version 17.2 for postgres`: AWS retires Postgres
         minor versions on a schedule, so a pinned minor is a deploy that stops
         working on a date nobody wrote down. `VER_17` renders `EngineVersion:
         "17"`, which RDS reads as the current default minor of 17, and
         `autoMinorVersionUpgrade` keeps it patched from there. The parameter
         group family derives from the *major* version either way, so it is
         unchanged at `postgres17`. */
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      instanceType: isProduction
        ? ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL)
        : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: "venturelly",
      allocatedStorage: 20,
      maxAllocatedStorage: 200,
      multiAz: isProduction,
      storageEncrypted: true,
      backupRetention: Duration.days(isProduction ? 14 : 1),

      /* Protected from the second deploy onwards, and deliberately not before.

         A production database that disappears with the stack is one `cdk
         destroy` away from losing every plan anybody has paid for — so it is
         retained, and protected from deletion. But applied to a *first* deploy
         those two turn a failure into a wedge, which is what happened:

             ROLLBACK_FAILED | VenturellySite
             DELETE_FAILED   | DatabaseSecurityGroup
             DELETE_FAILED   | Vpc/dataSubnet1, Vpc/dataSubnet2

         Note which resource is absent from that list. RETAIN did exactly what it
         says: CloudFormation kept the database. The retained instance's network
         interfaces then held the isolated subnets and the security group, so the
         rollback could not finish, and clearing it meant deleting by hand a
         database that had never finished being created and held nothing.

         There is nothing to protect on a bootstrap deploy, by definition — no
         migration has run against it and no plan can exist in it. So the
         protections arrive with the second deploy, which is also the one that
         brings the service up. Both directions are metadata or an in-place
         modify: neither replaces the instance. */
      deletionProtection: isProduction && !bootstrapping,
      removalPolicy:
        isProduction && !bootstrapping ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      enablePerformanceInsights: isProduction,
    });

    /* ---- Application secrets ------------------------------------------- */

    // Created empty and populated out of band. Putting a value in the template
    // means it is in CloudFormation's event history and in every `cdk diff`
    // anybody runs from then on.
    const appSecret = new secretsmanager.Secret(this, "AppSecret", {
      secretName: `${domainName}/app`,
      description:
        "BETTER_AUTH_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY. " +
        "Populate with `aws secretsmanager put-secret-value` before the first deploy.",
    });

    /* ---- Image --------------------------------------------------------- */

    const repository = new ecr.Repository(this, "Repository", {
      repositoryName: "venturelly",
      imageScanOnPush: true,
      lifecycleRules: [
        { description: "Keep the last 20 images", maxImageCount: 20 },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    /* ---- Service ------------------------------------------------------- */

    const cluster = new ecs.Cluster(this, "Cluster", { vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "Task", {
      // Chromium is the reason for the memory. A PDF render loads a full
      // browser alongside the Node server, and a task that is killed mid-render
      // looks to the user like the export button simply not working.
      cpu: isProduction ? 1024 : 512,
      memoryLimitMiB: isProduction ? 2048 : 1024,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64 },
    });

    const container = taskDefinition.addContainer("app", {
      image: ecs.ContainerImage.fromEcrRepository(repository, props.imageTag),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "venturelly",
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        NODE_ENV: "production",

        /* The standalone server binds `process.env.HOSTNAME`, and the runtime
           supplies one: in awsvpc mode the container's hostname is its private
           DNS name, and that arrives in the environment and wins over the
           image's `ENV HOSTNAME=0.0.0.0`. So the server bound one interface
           instead of all of them, which splits the two health checks apart —
           the load balancer reaches the task at its own address and passes,
           while the container check asks 127.0.0.1 and is refused:

               (task 4425b973…) failed container health checks

           and ECS kills a task the balancer considers healthy. Setting it
           explicitly here is what actually reaches the process; the image's
           value never survives.

           The startup banner is the tell. Bound to every interface Next prints
           `Local: http://localhost:3000`; it printed the EC2 internal name on
           both lines instead. */
        HOSTNAME: "0.0.0.0",

        NEXT_PUBLIC_SITE_URL: `https://${domainName}`,
        BETTER_AUTH_URL: `https://${domainName}`,
        CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",

        /* Where the database is. Not secret — an endpoint in a private isolated
           subnet is not reachable without the credentials above, and taking it
           from the construct rather than from the secret's attached fields means
           one less thing that has to be there. `docker-entrypoint.sh` composes
           DATABASE_URL from these five. */
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_PORT: database.dbInstanceEndpointPort,
        DB_NAME: "venturelly",

        /* Postgres 17's default parameter group ships `rds.force_ssl=1`, so the
           server rejects an unencrypted connection:

               no pg_hba.conf entry for host "10.0.3.139",
               user "venturelly", database "venturelly", no encryption

           Only the app hit this, which is what made it confusing: `prisma
           migrate deploy` runs on Prisma's own engine, which negotiates TLS by
           default, so migrations applied cleanly and then every query from the
           server failed. The app goes through `@prisma/adapter-pg`, and
           node-postgres defaults to `ssl: false` — a connection string with no
           `sslmode` resolves to no TLS at all.

           `no-verify` rather than `require`: node-postgres reads `require` as
           verify-full, and an RDS certificate chains to the Amazon RDS root,
           which is not in Node's trust store — so `require` fails to connect
           rather than connecting unverified. Encrypting without pinning the CA
           is what is available until the image carries the RDS bundle; the hop
           is to an address in an isolated subnet either way.

           This belongs here and not in the composed URL because the URL is
           assembled in the entrypoint, and the same value has to hold for a
           connection string this stack never sees. */
        PGSSLMODE: "no-verify",
      },
      secrets: {
        /* The credentials, and only the credentials.

           This asked for a `uri` key, and the tasks could not start:

               ResourceInitializationError: unable to pull secrets or registry
               auth: retrieved secret from Secrets Manager did not contain json
               key uri

           There is no such key and there never was. `dbSecret` is generated
           here with `username` and `password`; attaching it to the instance adds
           `engine`, `host`, `port`, `dbname` and `dbInstanceIdentifier`. Nothing
           in RDS or Secrets Manager composes a connection URL.

           So only the two keys this stack actually creates are read as secrets,
           and the rest of the connection comes from the construct as plain
           environment — see below. That also means this no longer depends on
           what the attachment happens to add. */
        DB_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
        BETTER_AUTH_SECRET: ecs.Secret.fromSecretsManager(appSecret, "BETTER_AUTH_SECRET"),
        STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(appSecret, "STRIPE_SECRET_KEY"),
        STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(appSecret, "STRIPE_WEBHOOK_SECRET"),
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(appSecret, "ANTHROPIC_API_KEY"),
      },
      healthCheck: {
        command: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        // The container applies migrations before it binds, so the first check
        // has to wait for that rather than killing the task that is doing it.
        startPeriod: Duration.seconds(90),
      },
    });
    container.addPortMappings({ containerPort: 3000, protocol: ecs.Protocol.TCP });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      // Zero while bootstrapping: a service that wants no tasks is stable
      // immediately, and CloudFormation stops waiting for tasks that could
      // never start. See BOOTSTRAP_TAG.
      desiredCount: bootstrapping ? 0 : isProduction ? 2 : 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(120),
    });

    database.connections.allowDefaultPortFrom(service, "Fargate tasks");
    dbSecret.grantRead(taskDefinition.taskRole);
    appSecret.grantRead(taskDefinition.taskRole);

    /* Not while bootstrapping, and this is the half of the fix that is easy to
       miss: Application Auto Scaling *enforces* `minCapacity`, so registering a
       scalable target here would raise the count back to 2 within moments and
       the service would fail to stabilise exactly as it did before. The second
       deploy registers it, against an image that exists. */
    if (isProduction && !bootstrapping) {
      const scaling = service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 6 });
      scaling.scaleOnCpuUtilization("Cpu", {
        targetUtilizationPercent: 65,
        scaleInCooldown: Duration.minutes(5),
        scaleOutCooldown: Duration.minutes(1),
      });
    }

    /* ---- Load balancer ------------------------------------------------- */

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      idleTimeout: Duration.seconds(120),
    });

    const zone = props.hostedZoneId
      ? route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
          hostedZoneId: props.hostedZoneId,
          zoneName: domainName,
        })
      // A lookup needs credentials and a zone that already exists; when the
      // zone is missing it returns a dummy and the deploy fails much later,
      // during certificate validation. Pass --context hostedZoneId= to skip it.
      : route53.HostedZone.fromLookup(this, "Zone", { domainName });

    // Regional certificate for the ALB. CloudFront needs its own, in us-east-1,
    // which is the one below.
    const albCertificate = new acm.Certificate(this, "AlbCertificate", {
      domainName: `origin.${domainName}`,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const listener = loadBalancer.addListener("Https", {
      port: 443,
      certificates: [albCertificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    });

    listener.addTargets("App", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/api/health",
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      // The PDF route holds a connection while Chromium renders. Draining
      // faster than that cuts a paying customer's export off mid-download.
      deregistrationDelay: Duration.seconds(60),
      stickinessCookieDuration: undefined,
    });

    loadBalancer.addListener("HttpRedirect", {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({ protocol: "HTTPS", port: "443", permanent: true }),
    });

    new route53.ARecord(this, "OriginRecord", {
      zone,
      recordName: "origin",
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
    });

    /* ---- Edge ---------------------------------------------------------- */

    const edgeCertificate = acm.Certificate.fromCertificateArn(
      this,
      "EdgeCertificate",
      props.edgeCertificateArn,
    );

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
            override: true,
          },
        ],
      },
    });

    const origin = new origins.HttpOrigin(`origin.${domainName}`, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      readTimeout: Duration.seconds(60),
      keepaliveTimeout: Duration.seconds(60),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      domainNames: [domainName, `www.${domainName}`],
      certificate: edgeCertificate,
      defaultBehavior: {
        origin,
        // The default has to assume every response is personal: this origin
        // serves an authenticated application, and caching a signed-in page at
        // the edge would hand one customer's plan to the next visitor.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
        compress: true,
      },
      additionalBehaviors: {
        // Content-hashed and immutable, so these are the ones worth caching —
        // and they carry no cookies, which is what makes it safe.
        "/_next/static/*": staticBehaviour(origin, securityHeaders),
        "/fonts/*": staticBehaviour(origin, securityHeaders),
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: isProduction,
    });

    for (const [id, recordName] of [["ApexRecord", undefined], ["WwwRecord", "www"]] as const) {
      new route53.ARecord(this, id, {
        zone,
        recordName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
      new route53.AaaaRecord(this, `${id}Ipv6`, {
        zone,
        recordName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    /* ---- Outputs, read by the CI workflow ------------------------------ */

    new CfnOutput(this, "EcrRepositoryUri", { value: repository.repositoryUri });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: service.serviceName });
    new CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "DistributionDomain", { value: distribution.distributionDomainName });
    new CfnOutput(this, "AppSecretArn", { value: appSecret.secretArn });
    new CfnOutput(this, "DatabaseSecretArn", { value: dbSecret.secretArn });
    new CfnOutput(this, "SiteUrl", { value: `https://${domainName}` });
  }
}

/** Long-lived, cookie-free, compressed. */
function staticBehaviour(
  origin: cloudfront.IOrigin,
  responseHeadersPolicy: cloudfront.ResponseHeadersPolicy,
): cloudfront.BehaviorOptions {
  return {
    origin,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    responseHeadersPolicy,
    compress: true,
  };
}
