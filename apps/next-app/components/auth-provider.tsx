"use client";

import { authConfig } from "@/lib/amplify-config";
import { Amplify } from "aws-amplify";

// Configure Amplify once at module level
Amplify.configure(authConfig, { ssr: true });

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
