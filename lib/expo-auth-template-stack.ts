import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AuthResources } from "./constructs/auth-resources";
import { ApiResources } from "./constructs/api-resources";

export class ExpoAuthTemplateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const auth = new AuthResources(this, "AuthResources");
    const api = new ApiResources(this, "ApiResources", {
      userPool: auth.userPool,
    });

    // Output important values
    new cdk.CfnOutput(this, "UserPoolId", { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: auth.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "OAuthDomain", { 
      value: `${auth.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com` 
    });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.api.url });
    new cdk.CfnOutput(this, "IdentityPoolId", { value: auth.identityPool.ref });
    new cdk.CfnOutput(this, "AppleAuthApiUrl", { value: auth.appleAuthApi.url });
  }
}
