"use client";

import { authConfig } from "@/lib/amplify-config";
import { Amplify } from "aws-amplify";
import { useEffect } from "react";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Configure Amplify on client side
    Amplify.configure(authConfig, { ssr: true });
  }, []);

  return <>{children}</>;
}
