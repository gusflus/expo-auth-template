"use client";

import { Amplify } from "aws-amplify";

Amplify.configure(
  {
    Auth: {
      Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
        userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
        signUpVerificationMethod: "code",
      },
    },
  },
  { ssr: true }
); // Crucial for Next.js App Router

export default function AuthConfig({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
