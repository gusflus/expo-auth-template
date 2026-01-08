import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class DatastoreResources extends Construct {
  public readonly usersTable: cdk.aws_dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.usersTable = new cdk.aws_dynamodb.Table(this, "UsersTable", {
      partitionKey: {
        name: "sub",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Add a GSI on email so we can lookup users by email if needed
    this.usersTable.addGlobalSecondaryIndex({
      indexName: "email-index",
      partitionKey: {
        name: "email",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, "UsersTableName", {
      value: this.usersTable.tableName,
    });
  }
}
