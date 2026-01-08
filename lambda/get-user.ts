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
      return {
        statusCode: 200,
        body: JSON.stringify({ item: resp.Item }),
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
      return {
        statusCode: 200,
        body: JSON.stringify({ item: scanResp.Items?.[0] ?? null }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({ item: null }) };
  } catch (err) {
    console.error("get-user error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal" }) };
  }
};
