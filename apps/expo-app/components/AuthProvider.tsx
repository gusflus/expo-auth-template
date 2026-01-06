import { Amplify } from "aws-amplify";
import { authConfig } from "../lib/amplify-config";
import { ReactNode, useEffect } from "react";

// Configure Amplify
Amplify.configure(authConfig);

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  return <>{children}</>;
}
