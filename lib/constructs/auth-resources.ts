import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class AuthResources extends Construct {
  public readonly userPool: cdk.aws_cognito.UserPool;
  public readonly userPoolClient: cdk.aws_cognito.UserPoolClient;
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

    // TODO: Add OAuth providers later
    // const googleProvider = new cdk.aws_cognito.UserPoolIdentityProviderGoogle(this, "GoogleProvider", {
    //   userPool: this.userPool,
    //   clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
    //   scopes: ["email", "openid", "profile"],
    //   attributeMapping: {
    //     email: cdk.aws_cognito.ProviderAttribute.GOOGLE_EMAIL,
    //     givenName: cdk.aws_cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
    //     familyName: cdk.aws_cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
    //   },
    // });

    // const appleProvider = new cdk.aws_cognito.UserPoolIdentityProviderApple(this, "AppleProvider", {
    //   userPool: this.userPool,
    //   clientId: process.env.APPLE_CLIENT_ID || "placeholder",
    //   teamId: process.env.APPLE_TEAM_ID || "placeholder",
    //   keyId: process.env.APPLE_KEY_ID || "placeholder",
    //   privateKey: process.env.APPLE_PRIVATE_KEY || "placeholder",
    //   scopes: ["email", "name"],
    //   attributeMapping: {
    //     email: cdk.aws_cognito.ProviderAttribute.APPLE_EMAIL,
    //     givenName: cdk.aws_cognito.ProviderAttribute.APPLE_FIRST_NAME,
    //     familyName: cdk.aws_cognito.ProviderAttribute.APPLE_LAST_NAME,
    //   },
    // });

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
        // TODO: Add OAuth configuration later
        // oAuth: {
        //   flows: {
        //     authorizationCodeGrant: true,
        //   },
        //   scopes: [cdk.aws_cognito.OAuthScope.EMAIL, cdk.aws_cognito.OAuthScope.OPENID, cdk.aws_cognito.OAuthScope.PROFILE],
        //   callbackUrls: ["http://localhost:3000/auth/callback"],
        //   logoutUrls: ["http://localhost:3000"],
        // },
        // supportedIdentityProviders: [
        //   cdk.aws_cognito.UserPoolClientIdentityProvider.COGNITO,
        //   cdk.aws_cognito.UserPoolClientIdentityProvider.GOOGLE,
        //   cdk.aws_cognito.UserPoolClientIdentityProvider.APPLE,
        // ],
      }
    );

    // this.userPoolClient.node.addDependency(googleProvider);
    // this.userPoolClient.node.addDependency(appleProvider);

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
