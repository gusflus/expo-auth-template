import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

interface AuthResourcesProps {
  table: cdk.aws_dynamodb.Table;
  domainPrefix: string;
  callbackUrls: string[];
  logoutUrls: string[];

  // Google client secret: either the Secrets Manager secret name/ARN, or an ISecret
  // (preferred). If you store a JSON object in SecretsManager, set
  // `googleClientSecretJsonField` to the key to pull.
  googleClientId: string;
  googleClientSecret?: string | cdk.aws_secretsmanager.ISecret;
  googleClientSecretJsonField?: string;

  appleClientId: string;
  appleTeamId: string;
  appleKeyId: string;
  // Apple private key: Secrets Manager secret name/ARN or ISecret. Use
  // `applePrivateKeyJsonField` if your secret is a JSON object.
  applePrivateKey?: string | cdk.aws_secretsmanager.ISecret;
  applePrivateKeyJsonField?: string;

  appleBundleId: string;
  appleServiceId: string;
}

export class AuthResources extends Construct {
  public readonly userPool: cdk.aws_cognito.UserPool;
  public readonly userPoolClient: cdk.aws_cognito.UserPoolClient;
  public readonly userPoolDomain: cdk.aws_cognito.UserPoolDomain;
  public readonly identityPool: cdk.aws_cognito.CfnIdentityPool;
  public readonly appleAuthApi: cdk.aws_apigateway.RestApi;

  public readonly appleAuthLambda?: cdk.aws_lambda.Function;
  public readonly checkEmailLambda: cdk.aws_lambda.Function;
  public readonly replaceUnconfirmedLambda: cdk.aws_lambda.Function;
  public readonly getUserLambda: cdk.aws_lambda.Function;
  public readonly updateUserLambda: cdk.aws_lambda.Function;
  public readonly postConfirmLambda: cdk.aws_lambda.Function;
  public readonly customMessageLambda: cdk.aws_lambda.Function;

  constructor(scope: Construct, id: string, props: AuthResourcesProps) {
    super(scope, id);

    // Require the calling stack to provide essential configuration values.
    if (!props || !props.domainPrefix) {
      throw new Error(
        "AuthResources requires 'domainPrefix' to be provided in props (resolve env vars in your Stack and pass them in)"
      );
    }
    if (!props.callbackUrls || props.callbackUrls.length === 0) {
      throw new Error(
        "AuthResources requires 'callbackUrls' (non-empty array) in props"
      );
    }

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
    this.userPoolDomain = new cdk.aws_cognito.UserPoolDomain(
      this,
      "UserPoolDomain",
      {
        userPool: this.userPool,
        cognitoDomain: {
          domainPrefix: props.domainPrefix,
        },
      }
    );

    // Conditionally create identity providers only when their required configuration is provided
    let googleProvider:
      | cdk.aws_cognito.UserPoolIdentityProviderGoogle
      | undefined;
    if (props.googleClientId && props.googleClientSecret) {
      // Resolve the secret from Secrets Manager. The prop may be a secret name
      // (or ARN) string, or an ISecret instance. Passing plaintext secrets in
      // props is not supported (throws) to avoid embedding secrets into the
      // CloudFormation template.
      let googleSecret: cdk.aws_secretsmanager.ISecret | undefined;
      if (typeof props.googleClientSecret === "string") {
        const s = props.googleClientSecret;
        if (s.startsWith("arn:")) {
          googleSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
            this,
            "GoogleClientSecret",
            s
          );
        } else {
          googleSecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(
            this,
            "GoogleClientSecret",
            s
          );
        }
      } else if (
        (props.googleClientSecret as any).__proto__ ||
        (props.googleClientSecret as any).secretArn
      ) {
        googleSecret =
          props.googleClientSecret as cdk.aws_secretsmanager.ISecret;
      } else {
        throw new Error(
          "AuthResources: googleClientSecret must be a Secrets Manager secret name/ARN or an ISecret (do not pass plaintext)."
        );
      }

      const clientSecretValue = props.googleClientSecretJsonField
        ? googleSecret!.secretValueFromJson(props.googleClientSecretJsonField)
        : googleSecret!.secretValue;

      googleProvider = new cdk.aws_cognito.UserPoolIdentityProviderGoogle(
        this,
        "GoogleProvider",
        {
          userPool: this.userPool,
          clientId: props.googleClientId,
          clientSecretValue: clientSecretValue,
          scopes: ["email", "openid", "profile"],
          attributeMapping: {
            email: cdk.aws_cognito.ProviderAttribute.GOOGLE_EMAIL,
            givenName: cdk.aws_cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
            familyName: cdk.aws_cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          },
        }
      );
    }

    let appleProvider:
      | cdk.aws_cognito.UserPoolIdentityProviderApple
      | undefined;
    const hasAppleProviderConfig =
      props.appleClientId &&
      props.appleTeamId &&
      props.appleKeyId &&
      props.applePrivateKey;
    if (hasAppleProviderConfig) {
      // Resolve Apple private key from Secrets Manager (name/ARN or ISecret)
      let appleSecret: cdk.aws_secretsmanager.ISecret | undefined;
      if (typeof props.applePrivateKey === "string") {
        const s = props.applePrivateKey;
        if (s.startsWith("arn:")) {
          appleSecret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(
            this,
            "ApplePrivateKey",
            s
          );
        } else {
          appleSecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(
            this,
            "ApplePrivateKey",
            s
          );
        }
      } else if ((props.applePrivateKey as any)?.secretArn) {
        appleSecret = props.applePrivateKey as cdk.aws_secretsmanager.ISecret;
      } else {
        throw new Error(
          "AuthResources: applePrivateKey must be a Secrets Manager secret name/ARN or an ISecret (do not pass plaintext)."
        );
      }

      const privateKeyValue = props.applePrivateKeyJsonField
        ? appleSecret!.secretValueFromJson(props.applePrivateKeyJsonField)
        : appleSecret!.secretValue;

      appleProvider = new cdk.aws_cognito.UserPoolIdentityProviderApple(
        this,
        "AppleProvider",
        {
          userPool: this.userPool,
          clientId: props.appleClientId!,
          teamId: props.appleTeamId!,
          keyId: props.appleKeyId!,
          privateKeyValue: privateKeyValue,
          scopes: ["email", "name"],
          attributeMapping: {
            email: cdk.aws_cognito.ProviderAttribute.APPLE_EMAIL,
            givenName: cdk.aws_cognito.ProviderAttribute.APPLE_FIRST_NAME,
            familyName: cdk.aws_cognito.ProviderAttribute.APPLE_LAST_NAME,
          },
        }
      );
    }

    // Build supported identity providers list based on what was configured
    const supportedIdentityProviders: cdk.aws_cognito.UserPoolClientIdentityProvider[] =
      [cdk.aws_cognito.UserPoolClientIdentityProvider.COGNITO];
    if (googleProvider)
      supportedIdentityProviders.push(
        cdk.aws_cognito.UserPoolClientIdentityProvider.GOOGLE
      );
    if (appleProvider)
      supportedIdentityProviders.push(
        cdk.aws_cognito.UserPoolClientIdentityProvider.APPLE
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
          callbackUrls: props.callbackUrls,
          logoutUrls: props.logoutUrls,
        },
        supportedIdentityProviders: supportedIdentityProviders,
        refreshTokenValidity: cdk.Duration.days(365),
      }
    );

    if (googleProvider) this.userPoolClient.node.addDependency(googleProvider);
    if (appleProvider) this.userPoolClient.node.addDependency(appleProvider);

    this.userPool.addGroup("AdminsGroup", {
      groupName: `${this.userPool.userPoolId}_Admin`,
      description: "Administrators group",
      precedence: 0,
    });

    this.userPool.addGroup("EmailGroup", {
      groupName: `${this.userPool.userPoolId}_Email`,
      description: "Users group (signup with email)",
    });

    // Create Cognito Identity Pool for native Apple Sign In
    const supportedLoginProviders = props.appleBundleId
      ? { "appleid.apple.com": props.appleBundleId }
      : undefined;

    this.identityPool = new cdk.aws_cognito.CfnIdentityPool(
      this,
      "IdentityPool",
      {
        allowUnauthenticatedIdentities: false,
        supportedLoginProviders: supportedLoginProviders,
      }
    );

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
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonCognitoPowerUser"
        ),
      ],
    });

    // Attach the role to the identity pool
    new cdk.aws_cognito.CfnIdentityPoolRoleAttachment(
      this,
      "IdentityPoolRoleAttachment",
      {
        identityPoolId: this.identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
        },
      }
    );

    // Create a general auth API (used for Apple native sign-in endpoints and other helper endpoints)
    this.appleAuthApi = new cdk.aws_apigateway.RestApi(this, "AppleAuthApi", {
      restApiName: "Auth Service",
      description: "API for authentication helper endpoints",
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    this.appleAuthLambda = new cdk.aws_lambda.Function(
      this,
      "AppleAuthLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        handler: "apple-auth.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist"),
          {
            // exclude source files - include package and node_modules so runtime deps are packaged
            exclude: ["**/*.ts"],
          }
        ),
        environment: {
          IDENTITY_POOL_ID: this.identityPool.ref,
          USER_POOL_ID: this.userPool.userPoolId,
          USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
          TABLE_NAME: props.table.tableName,

          APPLE_CLIENT_ID: props.appleClientId,
          APPLE_BUNDLE_ID: props.appleBundleId,
          APPLE_SERVICE_ID: props.appleServiceId,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    // Grant permissions to the Lambda
    this.appleAuthLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          "cognito-identity:GetId",
          "cognito-identity:GetCredentialsForIdentity",
        ],
        resources: ["*"],
      })
    );

    // Allow managing users in the User Pool (create/link users)
    this.appleAuthLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminLinkProviderForUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminInitiateAuth",        ],
        resources: [
          `arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`,
        ],
      })
    );

    const appleAuthIntegration = new cdk.aws_apigateway.LambdaIntegration(
      this.appleAuthLambda
    );
    this.appleAuthApi.root
      .addResource("apple-auth")
      .addMethod("POST", appleAuthIntegration);

    // Grant the apple auth lambda read/write access so it can persist initial user info
    props.table.grantReadWriteData(this.appleAuthLambda);

    // Create Lambda function for checking whether an email already exists in the user pool
    this.checkEmailLambda = new cdk.aws_lambda.Function(
      this,
      "CheckEmailLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        handler: "check-email.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist"),
          {
            exclude: ["**/*.ts"],
          }
        ),
        environment: {
          USER_POOL_ID: this.userPool.userPoolId,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    // Permissions for the check email Lambda - only needs to list/get users
    this.checkEmailLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["cognito-idp:ListUsers", "cognito-idp:AdminGetUser"],
        resources: [
          `arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`,
        ],
      })
    );

    const checkEmailIntegration = new cdk.aws_apigateway.LambdaIntegration(
      this.checkEmailLambda
    );
    this.appleAuthApi.root
      .addResource("check-email")
      .addMethod("POST", checkEmailIntegration);

    this.replaceUnconfirmedLambda = new cdk.aws_lambda.Function(
      this,
      "ReplaceUnconfirmedLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        handler: "replace-unconfirmed.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist"),
          {
            exclude: ["**/*.ts"],
          }
        ),
        environment: {
          USER_POOL_ID: this.userPool.userPoolId,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    this.replaceUnconfirmedLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDeleteUser",
        ],
        resources: [
          `arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`,
        ],
      })
    );

    const replaceUnconfirmedIntegration =
      new cdk.aws_apigateway.LambdaIntegration(this.replaceUnconfirmedLambda);

    this.appleAuthApi.root
      .addResource("replace-unconfirmed")
      .addMethod("POST", replaceUnconfirmedIntegration);

    // Grant the apple auth lambda read/write access so it can persist initial user info (only if lambda was created)
    if (this.appleAuthLambda)
      props.table.grantReadWriteData(this.appleAuthLambda);

    // Lambda to get user data from DynamoDB
    this.getUserLambda = new cdk.aws_lambda.Function(this, "GetUserLambda", {
      runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
      handler: "get-user.handler",
      code: cdk.aws_lambda.Code.fromAsset(
        path.join(__dirname, "../../lambda/dist"),
        {
          exclude: ["**/*.ts"],
        }
      ),
      environment: {
        TABLE_NAME: props.table.tableName,
      },
      timeout: cdk.Duration.seconds(10),
    });

    props.table.grantReadData(this.getUserLambda);

    const getUserIntegration = new cdk.aws_apigateway.LambdaIntegration(
      this.getUserLambda
    );
    this.appleAuthApi.root
      .addResource("user")
      .addMethod("GET", getUserIntegration);

    // Lambda to update user data (merge missing attributes)
    this.updateUserLambda = new cdk.aws_lambda.Function(
      this,
      "UpdateUserLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        handler: "update-user.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist"),
          {
            exclude: ["**/*.ts"],
          }
        ),
        environment: {
          TABLE_NAME: props.table.tableName,
          USER_POOL_ID: this.userPool.userPoolId,
        },
        timeout: cdk.Duration.seconds(10),
      }
    );

    props.table.grantWriteData(this.updateUserLambda);

    // The update lambda may need to write back to Cognito attributes
    this.updateUserLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["cognito-idp:AdminUpdateUserAttributes"],
        resources: [
          `arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`,
        ],
      })
    );

    const updateUserIntegration = new cdk.aws_apigateway.LambdaIntegration(
      this.updateUserLambda
    );
    this.appleAuthApi.root
      .getResource("user")
      ?.addMethod("POST", updateUserIntegration);

    // Post-confirmation trigger to persist users that sign up with Cognito flows
    this.postConfirmLambda = new cdk.aws_lambda.Function(
      this,
      "PostConfirmLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        handler: "post-confirm.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist"),
          {
            exclude: ["**/*.ts"],
          }
        ),
        environment: {
          TABLE_NAME: props.table.tableName,
        },
        timeout: cdk.Duration.seconds(10),
      }
    );

    props.table.grantReadWriteData(this.postConfirmLambda);
    this.postConfirmLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["cognito-idp:AdminGetUser"],
        resources: [
          `arn:aws:cognito-idp:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:userpool/*`,
        ],
      })
    );

    // Attach the post confirmation trigger to the User Pool
    this.userPool.addTrigger(
      cdk.aws_cognito.UserPoolOperation.POST_CONFIRMATION,
      this.postConfirmLambda
    );

    // Create Lambda for customizing Cognito messages (signup codes, forgot password, etc.)
    this.customMessageLambda = new cdk.aws_lambda.Function(
      this,
      "CustomMessageLambda",
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_LATEST,
        handler: "custom-message.handler",
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist"),
          { exclude: ["**/*.ts"] }
        ),
        timeout: cdk.Duration.seconds(10),
      }
    );

    // Attach the custom message trigger to the User Pool
    this.userPool.addTrigger(
      cdk.aws_cognito.UserPoolOperation.CUSTOM_MESSAGE,
      this.customMessageLambda
    );
  }
}
