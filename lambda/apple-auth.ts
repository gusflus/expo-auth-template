import {
  CognitoIdentityClient,
  GetCredentialsForIdentityCommand,
  GetIdCommand,
} from "@aws-sdk/client-cognito-identity";
import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const cognitoIdentity = new CognitoIdentityClient({
  region: process.env.AWS_REGION,
});

// Client to manage the User Pool (create/link users)
const cognitoIdp = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// Optional DynamoDB client to persist user records if a table is configured
let ddbClient: DynamoDBDocumentClient | null = null;
if (process.env.TABLE_NAME) {
  const lowLevel = new DynamoDBClient({ region: process.env.AWS_REGION });
  ddbClient = DynamoDBDocumentClient.from(lowLevel);
}

const client = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

async function verifyAppleToken(identityToken: string): Promise<any> {
  // Decode token without verifying to inspect aud claim and help choose allowed audiences
  const decodedUnverified = jwt.decode(identityToken, { complete: true })
    ?.payload as any;
  const tokenAud = decodedUnverified?.aud;

  // Accept the configured client id and any explicitly provided bundle/service ids
  const allowedAudiences = [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_BUNDLE_ID,
    process.env.APPLE_SERVICE_ID,
  ].filter(Boolean);

  if (tokenAud) {
    console.info("Apple token aud:", tokenAud);
  } else {
    console.info("Apple token has no aud claim");
  }

  // jsonwebtoken expects audience to be a string, regex, or an array/tuple.
  // If we don't have any configured audiences, omit the audience option so jwt.verify won't enforce it.
  let audienceOption:
    | undefined
    | string
    | RegExp
    | [string | RegExp, ...(string | RegExp)[]];
  if (allowedAudiences.length === 0) {
    audienceOption = undefined;
  } else if (allowedAudiences.length === 1) {
    audienceOption = allowedAudiences[0] as string;
  } else {
    audienceOption = allowedAudiences as [string, ...string[]];
  }

  const verifyOptions: any = { issuer: "https://appleid.apple.com" };
  if (audienceOption) verifyOptions.audience = audienceOption;

  return new Promise((resolve, reject) => {
    jwt.verify(identityToken, getKey, verifyOptions, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

// Helper: look up a user by email and extract linked providers (if any)
async function findUserByEmail(
  userPoolId: string,
  email: string
): Promise<{ username: string; providers: string[] } | null> {
  try {
    const list = await cognitoIdp.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
        Limit: 1,
      })
    );
    if (!list.Users || !list.Users.length) return null;
    const user = list.Users[0];
    const username = user.Username!;

    // Attempt to parse federated identities from 'identities' attribute
    const identitiesAttr = user.Attributes?.find(
      (a) => a.Name === "identities"
    )?.Value;
    let providers: string[] = [];
    if (identitiesAttr) {
      try {
        const identities = JSON.parse(identitiesAttr);
        if (Array.isArray(identities)) {
          providers = identities
            .map((i: any) => i.providerName)
            .filter(Boolean);
        }
      } catch (err) {
        console.warn("Failed to parse identities attribute", err);
      }
    }

    // Fallback: infer provider from username prefix like 'Google_12345' or 'apple_...'
    if (!providers.length && username.includes("_")) {
      const prefix = username.split("_")[0];
      if (prefix) providers.push(prefix);
    }

    return { username, providers };
  } catch (err) {
    console.warn("ListUsers failed", err);
    return null;
  }
}

// Ensure or create a User Pool user for this Apple identity. Return object with details or conflict info.
async function ensureUserInUserPool(
  sub: string,
  email?: string,
  incomingProvider?: string,
  incomingEmailVerified?: boolean
): Promise<{ username: string; providers: string[]; conflict?: boolean }> {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) throw new Error("USER_POOL_ID is not configured");

  if (email) {
    const existing = await findUserByEmail(userPoolId, email);
    if (existing) {
      const { username, providers } = existing;
      // If provider list doesn't include incoming provider, and there are providers already, treat as conflict
      const normalizedIncoming =
        incomingProvider ?? process.env.APPLE_PROVIDER_NAME;
      const hasProvider = providers.some((p) => p === normalizedIncoming);
      // Only treat as conflict if the incoming token's email is verified (prevents linking on unverified emails)
      if (
        !hasProvider &&
        providers.length &&
        (incomingEmailVerified ?? false)
      ) {
        return { username, providers, conflict: true };
      }

      // Otherwise return the existing username
      return { username, providers };
    }
  }

  // No existing user - create one and link the provider
  const username = `apple_${sub}`;
  try {
    const create = await cognitoIdp.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: "email", Value: email ?? "" },
          { Name: "email_verified", Value: "true" },
        ],
        MessageAction: "SUPPRESS",
      })
    );

    const createdUsername = create.User?.Username ?? username;

    // Link provider for a brand new user
    if (incomingProvider || process.env.APPLE_PROVIDER_NAME) {
      try {
        await cognitoIdp.send(
          new AdminLinkProviderForUserCommand({
            UserPoolId: userPoolId,
            DestinationUser: {
              ProviderName: "Cognito",
              ProviderAttributeName: "Username",
              ProviderAttributeValue: createdUsername,
            },
            SourceUser: {
              ProviderName:
                incomingProvider ?? process.env.APPLE_PROVIDER_NAME!,
              ProviderAttributeName: "Cognito_Subject",
              ProviderAttributeValue: sub,
            },
          })
        );
      } catch (err) {
        console.warn(
          "AdminLinkProviderForUser failed (may already be linked)",
          err
        );
      }
    }

    return {
      username: createdUsername,
      providers: [incomingProvider ?? process.env.APPLE_PROVIDER_NAME!],
    };
  } catch (err) {
    console.error("AdminCreateUser failed", err);
    throw err;
  }
}
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { identityToken } = JSON.parse(event.body || "{}");

    if (!identityToken) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({ error: "Identity token is required" }),
      };
    }

    // Verify the Apple identity token
    const decodedToken = await verifyAppleToken(identityToken);

    // Ensure a corresponding User Pool user exists. If there's a conflict (same email used with different provider), return a conflict response so the client can prompt the user.
    let userPoolUsername: string | null = null;
    if (process.env.USER_POOL_ID) {
      try {
        const result = await ensureUserInUserPool(
          decodedToken.sub,
          decodedToken.email,
          process.env.APPLE_PROVIDER_NAME,
          decodedToken.email_verified
        );
        if ((result as any).conflict) {
          console.warn(
            "Provider conflict detected for email:",
            decodedToken.email,
            "existingProviders:",
            (result as any).providers
          );
          return {
            statusCode: 409,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: JSON.stringify({
              error: "PROVIDER_CONFLICT",
              message:
                "An account with this email already exists using a different provider. Please sign in with that provider or choose to link accounts explicitly.",
              existingProviders: (result as any).providers,
              userPoolUsername: (result as any).username,
            }),
          };
        }

        userPoolUsername = (result as any).username;
        console.info("Ensured user in User Pool:", userPoolUsername);

        // If we have a DynamoDB table configured, upsert the user record with
        // whatever profile data we can glean from the provider/Cognito.
        try {
          if (ddbClient && decodedToken?.sub) {
            const firstName =
              decodedToken.given_name ||
              decodedToken.firstName ||
              decodedToken.name?.split?.(" ")?.[0] ||
              undefined;
            const lastName =
              decodedToken.family_name ||
              decodedToken.lastName ||
              (decodedToken.name
                ? decodedToken.name.split(" ").slice(1).join(" ")
                : undefined) ||
              undefined;

            await ddbClient.send(
              new PutCommand({
                TableName: process.env.TABLE_NAME,
                Item: {
                  id: decodedToken.sub,
                  entityType: "USER",
                  username: userPoolUsername,
                  email: decodedToken.email,
                  firstName,
                  lastName,
                  createdAt: new Date().toISOString(),
                },
              })
            );
          }
        } catch (err) {
          console.warn("Failed to persist user record to DynamoDB:", err);
        }
      } catch (err) {
        console.warn("Failed to ensure user in User Pool:", err);
      }
    }

    // Server-side token exchange is disabled for client-side federated flow.
    // We do not set passwords or call AdminInitiateAuth for federated users here.
    // The client should perform federated sign-in (for example, using Amplify's
    // `Auth.federatedSignIn` or the Cognito Hosted UI) with the Apple identity
    // token to obtain User Pool tokens when needed.

    // Get Cognito Identity ID
    const getIdCommand = new GetIdCommand({
      IdentityPoolId: process.env.IDENTITY_POOL_ID!,
      Logins: {
        "appleid.apple.com": identityToken,
      },
    });

    const identityResponse = await cognitoIdentity.send(getIdCommand);

    // Get AWS credentials
    const getCredentialsCommand = new GetCredentialsForIdentityCommand({
      IdentityId: identityResponse.IdentityId!,
      Logins: {
        "appleid.apple.com": identityToken,
      },
    });

    const credentialsResponse = await cognitoIdentity.send(
      getCredentialsCommand
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        identityId: identityResponse.IdentityId,
        credentials: {
          accessKeyId: credentialsResponse.Credentials?.AccessKeyId,
          secretKey: credentialsResponse.Credentials?.SecretKey,
          sessionToken: credentialsResponse.Credentials?.SessionToken,
          expiration: credentialsResponse.Credentials?.Expiration,
        },
        userInfo: {
          sub: decodedToken.sub,
          email: decodedToken.email,
          email_verified: decodedToken.email_verified,
        },
        userPoolUsername: userPoolUsername,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
