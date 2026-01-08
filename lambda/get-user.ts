import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const TABLE = process.env.USERS_TABLE_NAME;
let ddb: DynamoDBDocumentClient | null = null;
if (TABLE) {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  ddb = DynamoDBDocumentClient.from(client);
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!ddb || !TABLE) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "USERS_TABLE_NAME not configured" }),
      };
    }

    const sub =
      event.queryStringParameters?.sub || JSON.parse(event.body || "{}")?.sub;
    const username =
      event.queryStringParameters?.username ||
      JSON.parse(event.body || "{}")?.username;

    if (!sub && !username) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "sub or username is required" }),
      };
    }

    // If sub provided, fetch by primary key
    if (sub) {
      const resp = await ddb.send(
        new GetCommand({ TableName: TABLE, Key: { sub } })
      );
      const item = resp.Item ?? null;

      // If we found a user, check completeness
      if (item) {
        const missing: string[] = [];
        if (!item.username) missing.push("username");
        if (!item.email) missing.push("email");
        if (!item.firstName) missing.push("firstName");
        if (!item.lastName) missing.push("lastName");

        if (missing.length) {
          return {
            statusCode: 403,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
            },
            body: JSON.stringify({ code: "PROFILE_INCOMPLETE", missing, item }),
          };
        }
      }

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify({ item }),
      };
    }

    // If username provided, perform a Scan (small table assumption). In production, prefer a GSI on username.
    if (username) {
      const scanResp = await ddb.send(
        new ScanCommand({
          TableName: TABLE,
          FilterExpression: "#u = :u",
          ExpressionAttributeNames: { "#u": "username" },
          ExpressionAttributeValues: { ":u": username },
          Limit: 1,
        })
      );
      const item = scanResp.Items?.[0] ?? null;
      if (item) {
        const missing: string[] = [];
        if (!item.username) missing.push("username");
        if (!item.email) missing.push("email");
        if (!item.firstName) missing.push("firstName");
        if (!item.lastName) missing.push("lastName");

        if (missing.length) {
          return {
            statusCode: 403,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
            },
            body: JSON.stringify({ code: "PROFILE_INCOMPLETE", missing, item }),
          };
        }
      }

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify({ item }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: JSON.stringify({ item: null }),
    };
  } catch (err) {
    console.error("get-user error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal" }) };
  }
};
