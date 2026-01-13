import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

interface ApiResourcesProps {
  userPool: cdk.aws_cognito.UserPool;
  createAuthorizer: boolean;
}

export class ApiResources extends Construct {
  public readonly api: cdk.aws_apigateway.RestApi;
  public readonly authorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiResourcesProps) {
    super(scope, id);

    this.api = new cdk.aws_apigateway.RestApi(this, "Api", {
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
    });

    const protectedResource = this.api.root.addResource("protected");

    // Create the authorizer attached to the RestApi instance so it is
    // associated with this API (prevents the "Authorizer must be attached to a RestApi" error).
    this.authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(
      this.api,
      "UserPoolAuthorizer",
      {
        cognitoUserPools: [props.userPool],
      }
    );

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
        authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO,
        authorizer: this.authorizer,
      }
    );
  }
}
