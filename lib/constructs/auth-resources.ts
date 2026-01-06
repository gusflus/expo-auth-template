import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class AuthResources extends Construct {
  public readonly userPool: cdk.aws_cognito.UserPool;
  public readonly userPoolClient: cdk.aws_cognito.UserPoolClient;
  public readonly userPoolDomain: cdk.aws_cognito.UserPoolDomain;
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
    const userPoolDomain = new cdk.aws_cognito.UserPoolDomain(this, "UserPoolDomain", {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: "expo-auth-pp7xcj",
      },
    });

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
        ],
      }
    );

    this.userPoolClient.node.addDependency(googleProvider);

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
  }
}
