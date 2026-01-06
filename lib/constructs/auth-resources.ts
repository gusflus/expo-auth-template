import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class AuthResources extends Construct {
  public readonly userPool: cdk.aws_cognito.UserPool;
  public readonly userPoolClient: cdk.aws_cognito.UserPoolClient;
  public readonly userPoolDomain: cdk.aws_cognito.UserPoolDomain;
  public readonly identityPool: cdk.aws_cognito.CfnIdentityPool;
  public readonly appleAuthApi: cdk.aws_apigateway.RestApi;
  public readonly defaultUserGroupName: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const adminGroupName = "ExpoAuthTemplateAdminsGroup";
    this.defaultUserGroupName = "ExpoAuthTemplateUsersGroup";

    this.userPool = new cdk.aws_cognito.UserPool(this, "UserPool", {
      signInAliases: {
        email: true,
        username: true,
      },
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create a domain for the User Pool
    const userPoolDomain = new cdk.aws_cognito.UserPoolDomain(
      this,
      "UserPoolDomain",
      {
        userPool: this.userPool,
        cognitoDomain: {
          domainPrefix: "expo-auth-pp7xcj",
        },
      }
    );

    // Google OAuth provider
    const googleProvider = new cdk.aws_cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleProvider",
      {
        userPool: this.userPool,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecretValue: cdk.SecretValue.unsafePlainText(
          process.env.GOOGLE_CLIENT_SECRET!
        ),
        scopes: ["email", "openid", "profile"],
        attributeMapping: {
          email: cdk.aws_cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cdk.aws_cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cdk.aws_cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      }
    );

    // Apple OAuth provider
    const appleProvider = new cdk.aws_cognito.UserPoolIdentityProviderApple(
      this,
      "AppleProvider",
      {
        userPool: this.userPool,
        clientId: process.env.APPLE_CLIENT_ID!,
        teamId: process.env.APPLE_TEAM_ID!,
        keyId: process.env.APPLE_KEY_ID!,
        privateKey: process.env.APPLE_PRIVATE_KEY!,
        scopes: ["email", "name"],
        attributeMapping: {
          email: cdk.aws_cognito.ProviderAttribute.APPLE_EMAIL,
          givenName: cdk.aws_cognito.ProviderAttribute.APPLE_FIRST_NAME,
          familyName: cdk.aws_cognito.ProviderAttribute.APPLE_LAST_NAME,
        },
      }
    );

    this.userPoolClient = new cdk.aws_cognito.UserPoolClient(
      this,
      "UserPoolClient",
      {
        userPool: this.userPool,
        authFlows: {
          adminUserPassword: true,
          userPassword: true,
          userSrp: true,
          custom: true,
        },
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
          scopes: [
            cdk.aws_cognito.OAuthScope.EMAIL,
            cdk.aws_cognito.OAuthScope.OPENID,
            cdk.aws_cognito.OAuthScope.PROFILE,
          ],
          callbackUrls: ["http://localhost:3000/", "exp://localhost:8081/--/"],
          logoutUrls: ["http://localhost:3000/", "exp://localhost:8081/--/"],
        },
        supportedIdentityProviders: [
          cdk.aws_cognito.UserPoolClientIdentityProvider.COGNITO,
          cdk.aws_cognito.UserPoolClientIdentityProvider.GOOGLE,
          cdk.aws_cognito.UserPoolClientIdentityProvider.APPLE,
        ],
      }
    );

    this.userPoolClient.node.addDependency(googleProvider);
    this.userPoolClient.node.addDependency(appleProvider);

    this.userPoolDomain = userPoolDomain;

    this.userPool.addGroup("AdminsGroup", {
      groupName: adminGroupName,
      description: "Administrators group",
      precedence: 1,
    });

    this.userPool.addGroup("UsersGroup", {
      groupName: this.defaultUserGroupName,
      description: "Users group",
      precedence: 2,
    });

    // Create Cognito Identity Pool for native Apple Sign In
    this.identityPool = new cdk.aws_cognito.CfnIdentityPool(this, "IdentityPool", {
      allowUnauthenticatedIdentities: false,
      supportedLoginProviders: {
        // Use the native app bundle id if provided (matches token aud), otherwise fall back to the service id
        "appleid.apple.com": process.env.APPLE_BUNDLE_ID || process.env.APPLE_CLIENT_ID!,
      },
    });

    // Create IAM role for authenticated users
    const authenticatedRole = new cdk.aws_iam.Role(this, "AuthenticatedRole", {
      assumedBy: new cdk.aws_iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonCognitoPowerUser"),
      ],
    });

    // Attach the role to the identity pool
    new cdk.aws_cognito.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleAttachment", {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Create Lambda function for Apple authentication (bundled)
    const appleAuthLambda = new NodejsFunction(this, "AppleAuthLambda", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../lambda/apple-auth.ts'),
      handler: 'handler',
      bundling: {
        // Ensure these runtime deps are included in the bundle
        nodeModules: ['jsonwebtoken', 'jwks-rsa', '@aws-sdk/client-cognito-identity'],
      },
      environment: {
        IDENTITY_POOL_ID: this.identityPool.ref,
        APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID!,
        // Bundle ID used by the native app (e.g. com.gusflus.expoapp)
        APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID || 'com.gusflus.expoapp',
        // Also include the service ID explicitly so the lambda has both
        APPLE_SERVICE_ID: process.env.APPLE_SERVICE_ID || process.env.APPLE_CLIENT_ID!,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions to the Lambda
    appleAuthLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          "cognito-identity:GetId",
          "cognito-identity:GetCredentialsForIdentity",
        ],
        resources: ["*"],
      })
    );

    // Create API Gateway
    this.appleAuthApi = new cdk.aws_apigateway.RestApi(this, "AppleAuthApi", {
      restApiName: "Apple Auth Service",
      description: "API for native Apple Sign In authentication",
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const appleAuthIntegration = new cdk.aws_apigateway.LambdaIntegration(appleAuthLambda);
    this.appleAuthApi.root.addResource("apple-auth").addMethod("POST", appleAuthIntegration);
  }
}
