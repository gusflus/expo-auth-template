"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cognito_identity_1 = require("@aws-sdk/client-cognito-identity");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
const cognitoIdentity = new client_cognito_identity_1.CognitoIdentityClient({ region: process.env.AWS_REGION });
const client = (0, jwks_rsa_1.default)({
    jwksUri: 'https://appleid.apple.com/auth/keys',
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000, // 10 minutes
});
function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        const signingKey = key?.getPublicKey();
        callback(null, signingKey);
    });
}
async function verifyAppleToken(identityToken) {
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.verify(identityToken, getKey, {
            issuer: 'https://appleid.apple.com',
            audience: process.env.APPLE_CLIENT_ID,
        }, (err, decoded) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(decoded);
            }
        });
    });
}
const handler = async (event) => {
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
        const getIdCommand = new client_cognito_identity_1.GetIdCommand({
            IdentityPoolId: process.env.IDENTITY_POOL_ID,
            Logins: {
                'appleid.apple.com': identityToken,
            },
        });
        const identityResponse = await cognitoIdentity.send(getIdCommand);
        // Get AWS credentials
        const getCredentialsCommand = new client_cognito_identity_1.GetCredentialsForIdentityCommand({
            IdentityId: identityResponse.IdentityId,
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
    }
    catch (error) {
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
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbGUtYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwcGxlLWF1dGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOEVBQXlIO0FBQ3pILGdFQUErQjtBQUMvQix3REFBa0M7QUFFbEMsTUFBTSxlQUFlLEdBQUcsSUFBSSwrQ0FBcUIsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFFdEYsTUFBTSxNQUFNLEdBQUcsSUFBQSxrQkFBVSxFQUFDO0lBQ3hCLE9BQU8sRUFBRSxxQ0FBcUM7SUFDOUMsS0FBSyxFQUFFLElBQUk7SUFDWCxlQUFlLEVBQUUsQ0FBQztJQUNsQixXQUFXLEVBQUUsTUFBTSxFQUFFLGFBQWE7Q0FDbkMsQ0FBQyxDQUFDO0FBRUgsU0FBUyxNQUFNLENBQUMsTUFBVyxFQUFFLFFBQWE7SUFDeEMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQzVDLE1BQU0sVUFBVSxHQUFHLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztRQUN2QyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzdCLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxhQUFxQjtJQUNuRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3JDLHNCQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxNQUFNLEVBQUU7WUFDaEMsTUFBTSxFQUFFLDJCQUEyQjtZQUNuQyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlO1NBQ3RDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDbEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDUixNQUFNLENBQUMs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QkFBdUIsRUFBRSxDQUFDO1NBQ3pELENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBekVXLFFBQUEsT0FBTyxXQXlFbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBDb2duaXRvSWRlbnRpdHlDbGllbnQsIEdldENyZWRlbnRpYWxzRm9ySWRlbnRpdHlDb21tYW5kLCBHZXRJZENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtY29nbml0by1pZGVudGl0eSc7XG5pbXBvcnQgand0IGZyb20gJ2pzb253ZWJ0b2tlbic7XG5pbXBvcnQgandrc0NsaWVudCBmcm9tICdqd2tzLXJzYSc7XG5cbmNvbnN0IGNvZ25pdG9JZGVudGl0eSA9IG5ldyBDb2duaXRvSWRlbnRpdHlDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmNvbnN0IGNsaWVudCA9IGp3a3NDbGllbnQoe1xuICBqd2tzVXJpOiAnaHR0cHM6Ly9hcHBsZWlkLmFwcGxlLmNvbS9hdXRoL2tleXMnLFxuICBjYWNoZTogdHJ1ZSxcbiAgY2FjaGVNYXhFbnRyaWVzOiA1LFxuICBjYWNoZU1heEFnZTogNjAwMDAwLCAvLyAxMCBtaW51dGVzXG59KTtcblxuZnVuY3Rpb24gZ2V0S2V5KGhlYWRlcjogYW55LCBjYWxsYmFjazogYW55KSB7XG4gIGNsaWVudC5nZXRTaWduaW5nS2V5KGhlYWRlci5raWQsIChlcnIsIGtleSkgPT4ge1xuICAgIGNvbnN0IHNpZ25pbmdLZXkgPSBrZXk/LmdldFB1YmxpY0tleSgpO1xuICAgIGNhbGxiYWNrKG51bGwsIHNpZ25pbmdLZXkpO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdmVyaWZ5QXBwbGVUb2tlbihpZGVudGl0eVRva2VuOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGp3dC52ZXJpZnkoaWRlbnRpdHlUb2tlbiwgZ2V0S2V5LCB7XG4gICAgICBpc3N1ZXI6ICdodHRwczovL2FwcGxlaWQuYXBwbGUuY29tJyxcbiAgICAgIGF1ZGllbmNlOiBwcm9jZXNzLmVudi5BUFBMRV9DTElFTlRfSUQsXG4gICAgfSwgKGVyciwgZGVjb2RlZCkgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUoZGVjb2RlZCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgaWRlbnRpdHlUb2tlbiB9ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgIFxuICAgIGlmICghaWRlbnRpdHlUb2tlbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ1BPU1QsIE9QVElPTlMnLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSWRlbnRpdHkgdG9rZW4gaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBWZXJpZnkgdGhlIEFwcGxlIGlkZW50aXR5IHRva2VuXG4gICAgY29uc3QgZGVjb2RlZFRva2VuID0gYXdhaXQgdmVyaWZ5QXBwbGVUb2tlbihpZGVudGl0eVRva2VuKTtcbiAgICBcbiAgICAvLyBHZXQgQ29nbml0byBJZGVudGl0eSBJRFxuICAgIGNvbnN0IGdldElkQ29tbWFuZCA9IG5ldyBHZXRJZENvbW1hbmQoe1xuICAgICAgSWRlbnRpdHlQb29sSWQ6IHByb2Nlc3MuZW52LklERU5USVRZX1BPT0xfSUQhLFxuICAgICAgTG9naW5zOiB7XG4gICAgICAgICdhcHBsZWlkLmFwcGxlLmNvbSc6IGlkZW50aXR5VG9rZW4sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IGlkZW50aXR5UmVzcG9uc2UgPSBhd2FpdCBjb2duaXRvSWRlbnRpdHkuc2VuZChnZXRJZENvbW1hbmQpO1xuICAgIFxuICAgIC8vIEdldCBBV1MgY3JlZGVudGlhbHNcbiAgICBjb25zdCBnZXRDcmVkZW50aWFsc0NvbW1hbmQgPSBuZXcgR2V0Q3JlZGVudGlhbHNGb3JJZGVudGl0eUNvbW1hbmQoe1xuICAgICAgSWRlbnRpdHlJZDogaWRlbnRpdHlSZXNwb25zZS5JZGVudGl0eUlkISxcbiAgICAgIExvZ2luczoge1xuICAgICAgICAnYXBwbGVpZC5hcHBsZS5jb20nOiBpZGVudGl0eVRva2VuLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCBjcmVkZW50aWFsc1Jlc3BvbnNlID0gYXdhaXQgY29nbml0b0lkZW50aXR5LnNlbmQoZ2V0Q3JlZGVudGlhbHNDb21tYW5kKTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUnLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdQT1NULCBPUFRJT05TJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGlkZW50aXR5SWQ6IGlkZW50aXR5UmVzcG9uc2UuSWRlbnRpdHlJZCxcbiAgICAgICAgY3JlZGVudGlhbHM6IHtcbiAgICAgICAgICBhY2Nlc3NLZXlJZDogY3JlZGVudGlhbHNSZXNwb25zZS5DcmVkZW50aWFscz8uQWNjZXNzS2V5SWQsXG4gICAgICAgICAgc2VjcmV0S2V5OiBjcmVkZW50aWFsc1Jlc3BvbnNlLkNyZWRlbnRpYWxzPy5TZWNyZXRLZXksXG4gICAgICAgICAgc2Vzc2lvblRva2VuOiBjcmVkZW50aWFsc1Jlc3BvbnNlLkNyZWRlbnRpYWxzPy5TZXNzaW9uVG9rZW4sXG4gICAgICAgICAgZXhwaXJhdGlvbjogY3JlZGVudGlhbHNSZXNwb25zZS5DcmVkZW50aWFscz8uRXhwaXJhdGlvbixcbiAgICAgICAgfSxcbiAgICAgICAgdXNlckluZm86IHtcbiAgICAgICAgICBzdWI6IGRlY29kZWRUb2tlbi5zdWIsXG4gICAgICAgICAgZW1haWw6IGRlY29kZWRUb2tlbi5lbWFpbCxcbiAgICAgICAgICBlbWFpbF92ZXJpZmllZDogZGVjb2RlZFRva2VuLmVtYWlsX3ZlcmlmaWVkLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnUE9TVCwgT1BUSU9OUycsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==