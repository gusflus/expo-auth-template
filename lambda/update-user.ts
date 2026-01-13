import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const TABLE = process.env.TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
let ddb: DynamoDBDocumentClient | null = null;
if (TABLE) {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  ddb = DynamoDBDocumentClient.from(client);
}

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!ddb || !TABLE) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "TABLE_NAME not configured" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { sub, username, email, firstName, lastName } = body;

    if (!sub && !username) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "sub or username is required" }),
      };
    }

    // Update the user item (merge attributes)
    const updateExprParts: string[] = [];
    const exprAttrNames: Record<string, string> = {};
    const exprAttrValues: Record<string, any> = {};

    if (email) {
      updateExprParts.push("#e = :e");
      exprAttrNames["#e"] = "email";
      exprAttrValues[":e"] = email;
    }
    if (firstName) {
      updateExprParts.push("#fn = :fn");
      exprAttrNames["#fn"] = "firstName";
      exprAttrValues[":fn"] = firstName;
    }
    if (lastName) {
      updateExprParts.push("#ln = :ln");
      exprAttrNames["#ln"] = "lastName";
      exprAttrValues[":ln"] = lastName;
    }
    if (username) {
      updateExprParts.push("#u = :u");
      exprAttrNames["#u"] = "username";
      exprAttrValues[":u"] = username;
    }

    if (!updateExprParts.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No attributes provided to update" }),
      };
    }

    // If caller provided username but not sub, try to find the sub by scanning Username (small-scale)
    let targetSub = sub;
    if (!targetSub && username) {
      // Query username GSI for the user id
      const findResp = await ddb.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: "username-index",
          KeyConditionExpression: "#u = :u",
          FilterExpression: "#t = :t",
          ExpressionAttributeNames: { "#u": "username", "#t": "entityType" },
          ExpressionAttributeValues: { ":u": username, ":t": "USER" },
          Limit: 1,
        })
      );
      targetSub =
        (findResp.Items && findResp.Items[0] && findResp.Items[0].id) || null;
      if (!targetSub) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "User not found" }),
        };
      }
    }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: targetSub },
        UpdateExpression: `SET ${updateExprParts.join(", ")}`,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
        ReturnValues: "ALL_NEW",
      })
    );

    // Optionally update Cognito attributes (if username provided and USER_POOL_ID configured)
    if (username && USER_POOL_ID && (email || firstName || lastName)) {
      const userAttrs: any[] = [];
      if (email) userAttrs.push({ Name: "email", Value: email });
      if (firstName) userAttrs.push({ Name: "given_name", Value: firstName });
      if (lastName) userAttrs.push({ Name: "family_name", Value: lastName });

      try {
        await cognito.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            UserAttributes: userAttrs,
          })
        );
      } catch (err) {
        console.warn("Failed to sync attributes to Cognito:", err);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("update-user error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal" }) };
  }
};
