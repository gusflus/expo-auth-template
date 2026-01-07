import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

interface ApiResourcesProps {
  userPool: cdk.aws_cognito.UserPool;
}

export class ApiResources extends Construct {
  public readonly api: cdk.aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiResourcesProps) {
    super(scope, id);

    // NOTE: Removing the Cognito User Pools authorizer here to avoid a circular
    // CloudFormation dependency between the API and the User Pool resources.
    // The protected endpoint remains, but is unauthenticated for now. We can
    // reintroduce an authorizer in a separate stack or by using a token-based
    // custom authorizer if needed.

    this.api = new cdk.aws_apigateway.RestApi(this, "Api", {
      restApiName: "ExpoAuthTemplateApi",
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
    });

    // Example endpoint (was protected) — keeping it as a simple mock for now
    const protectedResource = this.api.root.addResource("protected");
    protectedResource.addMethod(
      "GET",
      new cdk.aws_apigateway.MockIntegration({
        integrationResponses: [
          {
            statusCode: "200",
            responseTemplates: {
              "application/json": '{"message": "Hello (was protected)"}',
            },
          },
        ],
        requestTemplates: {
          "application/json": '{"statusCode": 200}',
        },
      }),
      {
        methodResponses: [{ statusCode: "200" }],
      }
    );
  }
}
