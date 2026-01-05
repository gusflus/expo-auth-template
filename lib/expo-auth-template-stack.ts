import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AuthResources } from "./constructs/auth-resources";

export class ExpoAuthTemplateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new AuthResources(this, "AuthResources");
  }
}
