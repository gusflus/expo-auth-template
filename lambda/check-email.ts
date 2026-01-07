import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const cognitoIdp = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { email } = JSON.parse(event.body || "{}");

    if (!email) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({ error: "Email is required" }),
      };
    }

    const userPoolId = process.env.USER_POOL_ID;
    if (!userPoolId) throw new Error("USER_POOL_ID is not configured");

    const existing = await findUserByEmail(userPoolId, email);

    if (!existing) {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({ exists: false }),
      };
    }

    // If we found a user, return conflict with provider info
    return {
      statusCode: 409,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: JSON.stringify({
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists.",
        existingProviders: existing.providers,
        userPoolUsername: existing.username,
      }),
    };
  } catch (err) {
    console.error("Error in check-email:", err);
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
