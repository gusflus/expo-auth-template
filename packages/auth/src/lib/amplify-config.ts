import { ResourcesConfig } from "aws-amplify";

export function getAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): ResourcesConfig {
  return {
    Auth: {
      Cognito: {
        userPoolId: env.EXPO_PUBLIC_USER_POOL_ID!,
        userPoolClientId: env.EXPO_PUBLIC_USER_POOL_CLIENT_ID!,
        signUpVerificationMethod: "code",
        loginWith: {
          oauth: {
            domain: env.EXPO_PUBLIC_OAUTH_DOMAIN!,
            scopes: ["email", "openid", "profile"],
            redirectSignIn: env.EXPO_PUBLIC_OAUTH_REDIRECT_SIGNIN
              ? [env.EXPO_PUBLIC_OAUTH_REDIRECT_SIGNIN]
              : ["exp://localhost:8081/--/"],
            redirectSignOut: env.EXPO_PUBLIC_OAUTH_REDIRECT_SIGNOUT
              ? [env.EXPO_PUBLIC_OAUTH_REDIRECT_SIGNOUT]
              : ["exp://localhost:8081/--/"],
            responseType: "code",
            providers: env.EXPO_PUBLIC_OAUTH_PROVIDERS
              ? (env.EXPO_PUBLIC_OAUTH_PROVIDERS.split(",").map((s) =>
                  s.trim()
                ) as any)
              : (["Google", "Apple"] as any),
          },
        },
      },
    },
  };
}
