import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";
import { ApiResources } from "./constructs/api-resources";
import { AuthResources } from "./constructs/auth-resources";
import { DatastoreResources } from "./constructs/datastore-resources";

export class ExpoAuthTemplateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Resolve environment / deployment-time configuration here and pass into constructs

    // Domain prefix: generate a reasonable default if not provided.
    const domainPrefix = process.env.DOMAIN_PREFIX
      ? process.env.DOMAIN_PREFIX
      : `${this.stackName.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${
          cdk.Aws.ACCOUNT_ID
        }`;
    if (!process.env.DOMAIN_PREFIX) {
      console.warn(
        "No DOMAIN_PREFIX provided; generating one automatically from stack name and account ID"
      );
    }

    // Callback / logout URLs: attempt to infer from the Expo app config, otherwise fall back to sane defaults
    let callbackUrls: string[] = [];
    let logoutUrls: string[] = [];
    if (process.env.APP_CALLBACK_URLS) {
      callbackUrls = process.env
        .APP_CALLBACK_URLS!.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (process.env.APP_LOGOUT_URLS) {
      logoutUrls = process.env
        .APP_LOGOUT_URLS!.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (callbackUrls.length === 0 || logoutUrls.length === 0) {
      try {
        const appJsonPath = path.join(
          __dirname,
          "..",
          "apps",
          "expo-app",
          "app.json"
        );
        const raw = fs.readFileSync(appJsonPath, "utf8");
        const parsed = JSON.parse(raw);
        const scheme = parsed?.expo?.scheme;
        if (scheme) {
          const deepUrl = `${scheme}://redirect`;
          // Add Expo dev url and a deep link
          if (callbackUrls.length === 0)
            callbackUrls.push(
              deepUrl,
              "http://localhost:3000",
              "exp://127.0.0.1:19000"
            );
          if (logoutUrls.length === 0)
            logoutUrls.push(deepUrl, "http://localhost:3000");
        }
      } catch (e) {
        // ignore and fall back to localhost
      }

      if (callbackUrls.length === 0) callbackUrls.push("http://localhost:3000");
      if (logoutUrls.length === 0) logoutUrls.push("http://localhost:3000");

      if (!process.env.APP_CALLBACK_URLS)
        console.warn(
          "No APP_CALLBACK_URLS provided; using default local and app scheme URLs where available"
        );
      if (!process.env.APP_LOGOUT_URLS)
        console.warn(
          "No APP_LOGOUT_URLS provided; using default local and app scheme URLs where available"
        );
    }

    if (!process.env.TABLE_REMOVAL_POLICY)
      throw new Error(
        "TABLE_REMOVAL_POLICY must be set in the environment (RETAIN or DESTROY)"
      );

    const datastore = new DatastoreResources(this, "DatastoreResources", {
      removalPolicy:
        process.env.TABLE_REMOVAL_POLICY === "DESTROY"
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
    });

    // Create or reference Secrets Manager secrets for provider credentials.
    // If you supply the raw secret value in env (GOOGLE_CLIENT_SECRET or APPLE_PRIVATE_KEY),
    // we'll create a Secret resource in this stack with that value (user accepted risks).
    // If you supply a secret name/ARN env var (GOOGLE_CLIENT_SECRET_NAME or APPLE_PRIVATE_KEY_SECRET_NAME),
    // we'll reference that existing secret.

    let googleSecret: cdk.aws_secretsmanager.ISecret | undefined;
    if (process.env.GOOGLE_CLIENT_SECRET) {
      googleSecret = new cdk.aws_secretsmanager.Secret(
        this,
        "GoogleClientSecret",
        {
          description: "Google OAuth client secret",
          secretStringValue: cdk.SecretValue.unsafePlainText(
            process.env.GOOGLE_CLIENT_SECRET
          ),
        }
      );
      // Keep secret on stack deletion
      googleSecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    } else if (process.env.GOOGLE_CLIENT_SECRET_NAME) {
      googleSecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(
        this,
        "GoogleClientSecretRef",
        process.env.GOOGLE_CLIENT_SECRET_NAME
      );
    }

    let appleSecret: cdk.aws_secretsmanager.ISecret | undefined;
    if (process.env.APPLE_PRIVATE_KEY) {
      appleSecret = new cdk.aws_secretsmanager.Secret(this, "ApplePrivateKey", {
        description: "Apple private key for Sign in with Apple",
        secretStringValue: cdk.SecretValue.unsafePlainText(
          process.env.APPLE_PRIVATE_KEY
        ),
      });
      appleSecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    } else if (process.env.APPLE_PRIVATE_KEY_SECRET_NAME) {
      appleSecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(
        this,
        "ApplePrivateKeyRef",
        process.env.APPLE_PRIVATE_KEY_SECRET_NAME
      );
    }

    const auth = new AuthResources(this, "AuthResources", {
      table: datastore.table,
      domainPrefix: domainPrefix,
      callbackUrls: callbackUrls,
      logoutUrls: logoutUrls,
      googleClientId: process.env.GOOGLE_CLIENT_ID!,
      // pass the Secret (ISecret) or a secret name/ARN string to AuthResources
      googleClientSecret: googleSecret || process.env.GOOGLE_CLIENT_SECRET_NAME,
      googleClientSecretJsonField: process.env.GOOGLE_CLIENT_SECRET_JSON_FIELD,
      appleClientId: process.env.APPLE_CLIENT_ID!,
      appleTeamId: process.env.APPLE_TEAM_ID!,
      appleKeyId: process.env.APPLE_KEY_ID!,
      applePrivateKey: appleSecret || process.env.APPLE_PRIVATE_KEY_SECRET_NAME,
      applePrivateKeyJsonField: process.env.APPLE_PRIVATE_KEY_JSON_FIELD,
      appleBundleId: process.env.APPLE_BUNDLE_ID!,
      appleServiceId: process.env.APPLE_SERVICE_ID!,
    });

    const api = new ApiResources(this, "ApiResources", {
      userPool: auth.userPool,
      createAuthorizer: true,
    });

    // Output important values
    new cdk.CfnOutput(this, "UserPoolId", { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: auth.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "OAuthDomain", {
      value: `${auth.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.api.url });
    new cdk.CfnOutput(this, "IdentityPoolId", { value: auth.identityPool.ref });
    new cdk.CfnOutput(this, "AppleAuthApiUrl", {
      value: auth.appleAuthApi.url,
    });
  }
}
