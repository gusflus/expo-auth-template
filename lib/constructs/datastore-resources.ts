import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

interface DatastoreResourcesProps {
  removalPolicy: cdk.RemovalPolicy;
}

export class DatastoreResources extends Construct {
  public readonly table: cdk.aws_dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatastoreResourcesProps) {
    super(scope, id);

    this.table = new cdk.aws_dynamodb.Table(this, "Table", {
      partitionKey: {
        name: "id",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      removalPolicy: props.removalPolicy,
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "email-index",
      partitionKey: {
        name: "email",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
    });

    // GSI to query by username (unique identifier for user profiles)
    this.table.addGlobalSecondaryIndex({
      indexName: "username-index",
      partitionKey: {
        name: "username",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "entityType-index",
      partitionKey: {
        name: "entityType",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, "TableName", {
      value: this.table.tableName,
    });
  }
}
