import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// Cognito Post Confirmation Lambda has a slightly different signature; using any for simplicity
export const handler = async (event: any) => {
  try {
    const TABLE = process.env.TABLE_NAME;
    if (!TABLE) {
      console.warn("TABLE_NAME not configured");
      return event;
    }

    const low = new DynamoDBClient({ region: process.env.AWS_REGION });
    const ddb = DynamoDBDocumentClient.from(low);

    const userAttrs = event.request?.userAttributes || {};
    const sub = userAttrs.sub;
    if (!sub) return event;

    const item: any = {
      id: sub,
      entityType: "USER",
      username: event.userName,
      email: userAttrs.email,
      firstName: userAttrs.given_name || userAttrs.name || undefined,
      lastName: userAttrs.family_name || undefined,
      createdAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

    return event;
  } catch (err) {
    console.warn("post-confirm error", err);
    return event;
  }
};
