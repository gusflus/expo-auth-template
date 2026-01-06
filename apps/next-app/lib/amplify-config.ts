import { ResourcesConfig } from "aws-amplify";

export const authConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
      signUpVerificationMethod: "code",
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_OAUTH_DOMAIN!,
          scopes: ["email", "openid", "profile"],
          redirectSignIn: ["http://localhost:3000/"],
          redirectSignOut: ["http://localhost:3000/"],
          responseType: "code",
          providers: ["Google"],
        },
      },
    },
  },
};
