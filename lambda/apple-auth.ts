import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityClient, GetCredentialsForIdentityCommand, GetIdCommand } from '@aws-sdk/client-cognito-identity';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const cognitoIdentity = new CognitoIdentityClient({ region: process.env.AWS_REGION });

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

async function verifyAppleToken(identityToken: string): Promise<any> {
  // Decode token without verifying to inspect aud claim and help choose allowed audiences
  const decodedUnverified = jwt.decode(identityToken, { complete: true })?.payload as any;
  const tokenAud = decodedUnverified?.aud;

  // Accept the configured client id and any explicitly provided bundle/service ids
  const allowedAudiences = [process.env.APPLE_CLIENT_ID, process.env.APPLE_BUNDLE_ID, process.env.APPLE_SERVICE_ID].filter(Boolean);

  if (tokenAud) {
    console.info('Apple token aud:', tokenAud);
  } else {
    console.info('Apple token has no aud claim');
  }

  return new Promise((resolve, reject) => {
    jwt.verify(identityToken, getKey, {
      issuer: 'https://appleid.apple.com',
      audience: allowedAudiences.length ? allowedAudiences : process.env.APPLE_CLIENT_ID,
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { identityToken } = JSON.parse(event.body || '{}');
    
    if (!identityToken) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
        body: JSON.stringify({ error: 'Identity token is required' }),
      };
    }

    // Verify the Apple identity token
    const decodedToken = await verifyAppleToken(identityToken);
    
    // Get Cognito Identity ID
    const getIdCommand = new GetIdCommand({
      IdentityPoolId: process.env.IDENTITY_POOL_ID!,
      Logins: {
        'appleid.apple.com': identityToken,
      },
    });
    
    const identityResponse = await cognitoIdentity.send(getIdCommand);
    
    // Get AWS credentials
    const getCredentialsCommand = new GetCredentialsForIdentityCommand({
      IdentityId: identityResponse.IdentityId!,
      Logins: {
        'appleid.apple.com': identityToken,
      },
    });
    
    const credentialsResponse = await cognitoIdentity.send(getCredentialsCommand);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        identityId: identityResponse.IdentityId,
        credentials: {
          accessKeyId: credentialsResponse.Credentials?.AccessKeyId,
          secretKey: credentialsResponse.Credentials?.SecretKey,
          sessionToken: credentialsResponse.Credentials?.SessionToken,
          expiration: credentialsResponse.Credentials?.Expiration,
        },
        userInfo: {
          sub: decodedToken.sub,
          email: decodedToken.email,
          email_verified: decodedToken.email_verified,
        },
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
