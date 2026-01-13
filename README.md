# Expo Auth Template — Overview & Docs ✨

A compact example app demonstrating Cognito-based authentication, provider sign-in (Google & Apple), a simple Datastore (DynamoDB generic `Data` table), and an Expo client which enforces a "profile complete" workflow.

---

## Table of contents

- [What this repository contains](#what-this-repository-contains) ✅
- [Architecture](#architecture)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Important flows](#important-flows)
- [Deployment and CDK notes](#deployment-and-cdk-notes)
- [Troubleshooting and tips](#troubleshooting-and-tips)

---

## What this repository contains

- `lib/constructs/*` — CDK constructs for **AuthResources** (Cognito + Identity Pool + client), **ApiResources** (API Gateway) and **DatastoreResources** (Dynamo Users table).

Usage notes for `AuthResources` construct:

- The construct accepts props which must be supplied by the consuming stack (resolve environment variables at the Stack level and pass them in). This keeps environment-var access centralized in your Stack and avoids surprises inside the construct (the repo remains the source of truth during local development).

- Secrets should be supplied as `cdk.SecretValue` instances in production (recommended). For local convenience, the construct will accept a string and convert it to `SecretValue.unsafePlainText` when building `SecretValue` is helpful, but prefer `SecretValue.secretsManager(...)` for production secrets. Examples:

```ts
new AuthResources(stack, "AuthResources", {
  domainPrefix: "myapp-auth",
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: cdk.SecretValue.secretsManager("my/google/secret"), // production
  callbackUrls: ["https://myapp.example/callback"],
});
```

- The construct exposes important objects so a consumer can extend them (for example attach routes to `appleAuthApi` or add permissions to `replaceUnconfirmedLambda`): `appleAuthLambda`, `checkEmailLambda`, `replaceUnconfirmedLambda`, `getUserLambda`, `updateUserLambda`, and `appleAuthApi`.

Usage notes for `ApiResources` construct:

- The `props` object must be supplied by the consuming Stack (resolve env vars in the Stack and pass them in). This construct will not read deployment environment variables directly.

- Props:

  - `restApiName?: string` — override API name (default: "ExpoAuthTemplateApi").
  - `createAuthorizer?: boolean` — when true and `userPool` is supplied, the construct creates and exposes a Cognito `authorizer`.

- The `api` property is exposed and consumers can add routes or integrations as needed.

Usage notes for `DatastoreResources` construct:

- The `props` object should be supplied by the consuming Stack (the construct will not read deployment env vars directly).

- Props:

  - `tableName?: string` — specify a concrete DynamoDB table name (optional).
  - `removalPolicy?: cdk.RemovalPolicy` — override removal policy (default: RETAIN).

- The `table` is exposed and includes `email-index` and `username-index` GSIs by default for lookups.

- `lambda/` — Lambda handlers packed and deployed by CDK (Apple auth, get-user, update-user, post-confirm, check-email, etc.).
- `apps/expo-app/` — Expo (React Native) client demonstrating sign-up, confirmation, OAuth provider flows, and profile completion pages.
- CDK app entrypoint at `bin/expo-auth-template.ts` and stack in `lib/`.

---

## Architecture

High level:

- Cognito User Pool + Identity Pool manage authentication.
- OAuth providers (Google, Apple) configured on the User Pool.
- Post-confirmation and provider flows call Lambda handlers to upsert user rows into a DynamoDB `Users` table.
- An API (via Lambda + API Gateway) exposes endpoints for `GET /user` and `POST /user` to read and update profile data.
- The Expo app uses Amplify for client auth flows and calls the API to enforce a `profile_complete` workflow.

Data model: Generic DynamoDB `Data` table keyed by `id`. User items use `entityType = "USER"` and `id` = Cognito `sub`. A GSI on `email` is available for lookups.

---

## Local development

Prereqs:

- Node.js (16+ recommended), Yarn (Berry), TypeScript
- AWS CLI configured with credentials for the target account/region
- Expo CLI for testing client

Useful commands:

- Install deps: `yarn install`
- Build CDK (compile lambdas): `yarn cdk:build`
- CDK diff (no deploy): `yarn cdk diff --app "npx ts-node bin/expo-auth-template.ts"`
- CDK deploy: `yarn cdk:deploy --require-approval never`
- Run unit tests: `yarn test`
- Start Expo app (from `apps/expo-app`): `yarn workspace expo-app start` (or use `expo start`)

Notes:

- The Expo client uses `exp://localhost:8081/--/` for callbacks during local testing; Cognito client callback/logout URLs are set for this flow.

---

## Environment variables

Set these in your environment or CI before `cdk deploy` or local run of Lambdas. Example names (used in CDK):

- `REST_API_NAME` (required)
- `DOMAIN_PREFIX` (optional; if omitted a unique prefix is generated from the stack name and account id)
- `APP_CALLBACK_URLS` (optional, comma-separated list; defaults to common localhost and app scheme callbacks detected from `apps/expo-app/app.json`)
- `APP_LOGOUT_URLS` (optional, comma-separated list; defaults to the same as callback URLs)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional; required only if using Google IdP)
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID` (or `APPLE_SERVICE_ID`) (optional; required only if using Apple IdP)
- `APPLE_PROVIDER_NAME` (optional)

Notes: The Stack will now resolve required env variables at synth/deploy time and will throw if mandatory values are missing — this ensures constructs are always provided explicit configuration rather than relying on internal defaults.

Also, CDK will create resources with ARNs and environment injection for Lambdas (e.g., `TABLE_NAME` when Datastore construct is included).

---

## Important flows

1. Sign-up → Confirm → Auto sign-in → Profile completion

   - After sign-up, the user confirms via code on the `/confirm` page and the app attempts to sign them in automatically.
   - If the user is missing required attributes (email, firstName, lastName, username), the client redirects them to `/complete-profile` and posts the data to `POST /user` to persist in Dynamo and optionally sync to Cognito.

2. Provider sign-in (Google / Apple)

   - Provider attributes are mapped into Cognito via the configured identity provider mapping.
   - The Apple/Google handler upserts a user record into the `Users` table with available attributes.
   - If attributes are missing, the client prompts the user to complete them.

3. Profile enforcement
   - Server `GET /user` returns `403` with `{ code: "PROFILE_INCOMPLETE", missing: [...] }` when required fields are missing.
   - Client top-level guard checks `GET /user` and redirects to `/complete-profile` if needed.

Security nuance:

- To avoid a CloudFormation circular dependency (User Pool PostConfirmation trigger referencing a Lambda role that references the User Pool), the project uses a wildcard userpool ARN in specific lambda IAM policies (this breaks the direct circular reference). If you refactor triggers or roles, be mindful of that cycle.

---

## Deployment and CDK notes

Recommended merge order for safe rollouts (what we used here):

1. **Merge CDK/infra changes first** (so the infrastructure is in place/updated). Run `cdk diff` and review changes.
2. **Merge application/client code** afterwards, then run smoke tests.

When deploying:

- Always run `yarn cdk:build` to bundle lambda artifacts before diff/deploy.
- Use `yarn cdk diff` to inspect changes. Pay special attention to IAM and Cognito changes which may affect user flows.
- Use `cdk deploy` from a machine with the right AWS credentials and confirm any destructive changes before proceeding.

---

## Troubleshooting and tips

- Circular dependency errors in CloudFormation involving the User Pool PostConfirmation trigger can often be resolved by removing tight role-to-resource references (we used a wildcard pool ARN in the lambda policy).
- If OAuth inflows are flaky locally: ensure the Cognito client callback/logout URLs include your local Expo redirect URL (`exp://localhost:8081/--/`) and retry sign-in if tokens are not present immediately after redirect (we added a small retry/backoff in the client).
- Inspect CloudWatch logs for Lambda-specific failures and Cognito console for user pool events.

---

## Misc

- `apps/next-app` was used previously for a web client; it has been backed up and removed from the workspace to simplify the monorepo. If needed, you can find a backup in `backups/`.

---

## Contributing & support

- Create a branch, open a PR, and include `yarn cdk diff` output for infra changes if applicable.
- For CI: ensure tests and `yarn cdk:build` run in pipeline before deployment.

---

If you'd like, I can also add a short `README.AuthStore.md` that documents the `Users` table schema, or a `DEPLOY.md` with explicit CDK commands and safety checks. Want me to add either? 💡
