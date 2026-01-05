import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

interface ApiResourcesProps {
  userPool: cdk.aws_cognito.UserPool;
}

export class ApiResources extends Construct {
  public readonly api: cdk.aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiResourcesProps) {
    super(scope, id);

    const auth = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(this, "Authorizer", {
      cognitoUserPools: [props.userPool],
    });

    this.api = new cdk.aws_apigateway.RestApi(this, "Api", {
      restApiName: "ExpoAuthTemplateApi",
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
    });

    // Protected endpoint example
    const protectedResource = this.api.root.addResource("protected");
    protectedResource.addMethod("GET", 
      new cdk.aws_apigateway.MockIntegration({
        integrationResponses: [{
          statusCode: "200",
          responseTemplates: {
            "application/json": '{"message": "Hello authenticated user!"}'
          }
        }],
        requestTemplates: {
          "application/json": '{"statusCode": 200}'
        }
      }), {
        authorizer: auth,
        methodResponses: [{ statusCode: "200" }]
      }
    );
  }
}
