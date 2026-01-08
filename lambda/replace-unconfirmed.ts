import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const cognitoIdp = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// Helper: find single user by email
async function findUserByEmail(
  userPoolId: string,
  email: string
): Promise<{
  username: string;
  providers: string[];
  userStatus?: string;
  emailVerified?: boolean;
  createdAt?: number;
} | null> {
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

    // Extract linked provider identities if present
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
        console.warn(
          "replace-unconfirmed: Failed to parse identities attribute",
          err
        );
      }
    }

    // Fallback: infer provider from username prefix like 'Google_12345' or 'apple_...'
    if (!providers.length && username.includes("_")) {
      const prefix = username.split("_")[0];
      if (prefix) providers.push(prefix);
    }

    const userStatus = (user as any).UserStatus;
    const createdAt = (user as any).UserCreateDate
      ? new Date((user as any).UserCreateDate).getTime()
      : undefined;

    const emailVerifiedAttr = user.Attributes?.find(
      (a) => a.Name === "email_verified"
    )?.Value;
    const emailVerified =
      emailVerifiedAttr === "true" || emailVerifiedAttr === "True";

    return { username, providers, userStatus, emailVerified, createdAt };
  } catch (err) {
    console.warn("replace-unconfirmed: ListUsers failed", err);
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

    const found = await findUserByEmail(userPoolId, email);
    if (!found) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    // Safety: only allow deleting UNCONFIRMED users
    if (!found.userStatus || found.userStatus !== "UNCONFIRMED") {
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          error: "Cannot replace a confirmed or unknown-status account",
        }),
      };
    }

    // Ensure this is a native Cognito account (no federated providers linked)
    if (found.providers && found.providers.length > 0) {
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          error: "Cannot replace an account created via external provider",
        }),
      };
    }

    // Ensure email is not verified (extra check; UNCONFIRMED usually implies this)
    if (found.emailVerified) {
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          error: "Cannot replace an account with a verified email",
        }),
      };
    }

    // Optional TTL check (in ms). Default 0 = immediate allowed
    const TTL_MS = Number(process.env.REPLACE_UNCONFIRMED_TTL_MS || 0);
    if (
      TTL_MS > 0 &&
      found.createdAt &&
      Date.now() - found.createdAt < TTL_MS
    ) {
      return {
        statusCode: 409,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          error: "Unconfirmed account is too new to replace",
        }),
      };
    }

    // Proceed to delete
    try {
      await cognitoIdp.send(
        new AdminDeleteUserCommand({
          UserPoolId: userPoolId,
          Username: found.username,
        })
      );
      console.log("replace-unconfirmed: deleted user", found.username);
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({
          success: true,
          message: "Unconfirmed account cleared",
        }),
      };
    } catch (err) {
      console.error("replace-unconfirmed: AdminDeleteUser failed", err);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify({ error: "Failed to replace unconfirmed user" }),
      };
    }
  } catch (err) {
    console.error("Error in replace-unconfirmed:", err);
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
