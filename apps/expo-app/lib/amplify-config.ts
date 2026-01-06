import { ResourcesConfig } from "aws-amplify";

export const authConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID!,
      signUpVerificationMethod: "code",
      loginWith: {
        oauth: {
          domain: process.env.EXPO_PUBLIC_OAUTH_DOMAIN!,
          scopes: ["email", "openid", "profile"],
          redirectSignIn: ["exp://localhost:8081/--/"],
          redirectSignOut: ["exp://localhost:8081/--/"],
          responseType: "code",
          providers: ["Google", "Apple"],
        },
      },
    },
  },
};
