import AsyncStorage from "@react-native-async-storage/async-storage";
import { Amplify } from "aws-amplify";
import { fetchAuthSession, getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useRouter } from "expo-router";
import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { getAuthConfig } from "../lib/amplify-config";
import { getPendingSignup } from "../lib/pendingSignup";

// Configure Amplify using the app-level config so behavior matches the app
Amplify.configure(getAuthConfig());

export type Profile = {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  [k: string]: any;
} | null;

type ProfileStatus = "unknown" | "complete" | "incomplete";

export interface AuthContextType {
  checkingProfile: boolean;
  sub?: string | null;
  profile?: Profile;
  profileStatus: ProfileStatus;
  checkProfile: () => Promise<void>;
  signOutLocal: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();

  const [checkingProfile, setCheckingProfile] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("unknown");

  const safeNavigate = useCallback(
    (path: string) => {
      try {
        router.replace(path);
      } catch (err) {
        console.warn("navigation failed", err);
      }
    },
    [router]
  );

  const checkProfile = useCallback(async () => {
    const API_BASE = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
    setCheckingProfile(true);

    const MAX_ATTEMPTS = 5;
    let attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      try {
        attempt++;
        const session = await fetchAuthSession();
        const idTokenObj = (session as any)?.tokens?.idToken;
        const resolvedSub =
          idTokenObj?.payload?.sub || (await getCurrentUser())?.userId;

        setSub(resolvedSub ?? null);

        if (!resolvedSub) {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          safeNavigate("/login");
          setCheckingProfile(false);
          return;
        }

        if (!API_BASE) {
          setProfileStatus("unknown");
          setCheckingProfile(false);
          return;
        }

        const resp = await fetch(
          `${API_BASE}/user?sub=${encodeURIComponent(resolvedSub)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (resp.status === 403) {
          const payload = idTokenObj?.payload ?? {};
          setProfile({
            email: payload.email,
            firstName:
              payload.given_name ||
              (payload.name ? payload.name.split(" ")[0] : undefined),
            lastName:
              payload.family_name ||
              (payload.name
                ? payload.name.split(" ").slice(1).join(" ")
                : undefined),
          });
          setProfileStatus("incomplete");
          const q = new URLSearchParams();
          if (payload.email) q.set("email", payload.email);
          const first =
            payload.given_name ||
            (payload.name ? payload.name.split(" ")[0] : undefined);
          const last =
            payload.family_name ||
            (payload.name
              ? payload.name.split(" ").slice(1).join(" ")
              : undefined);
          if (first) q.set("firstName", first);
          if (last) q.set("lastName", last);
          safeNavigate(`/complete-profile?${q.toString()}`);
          setCheckingProfile(false);
          return;
        } else if (resp.ok) {
          const body: any = await resp.json().catch(() => ({}));
          const item = body.item ?? {};
          setProfileStatus("complete");
          setProfile(item);
          safeNavigate("/logged-in");
          setCheckingProfile(false);
          return;
        } else {
          console.warn(
            "AuthProvider: unexpected get-user response",
            resp.status
          );
          safeNavigate("/login");
          setCheckingProfile(false);
          return;
        }
      } catch (err: any) {
        const msg = err?.message ?? String(err);

        // Suppress noisy warnings for transient authentication errors while retrying.
        if (
          /(User needs to be authenticated|UserNotAuthenticated|UserNotAuthenticatedException)/i.test(
            msg
          )
        ) {
          // Expected transient state during sign-in/redirect flows — log at debug level only.
          console.debug(
            "AuthProvider: transient auth error (attempt)",
            attempt,
            msg
          );

          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }

          // After exhausting attempts, fall through to the normal handling.
        } else {
          console.warn(
            "AuthProvider: profile check failed (attempt)",
            attempt,
            msg
          );
        }

        safeNavigate("/login");
        setCheckingProfile(false);
        return;
      }
    }

    safeNavigate("/login");
    setCheckingProfile(false);
  }, [safeNavigate]);

  const signOutLocal = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const removal = keys.filter(
        (k) =>
          k.startsWith("CognitoIdentityServiceProvider") ||
          k.includes("CognitoIdentityId") ||
          k.includes("aws-amplify") ||
          k.includes("amplify") ||
          k.includes("idToken") ||
          k.includes("accessToken") ||
          k.includes("refreshToken")
      );
      if (removal.length) {
        await AsyncStorage.multiRemove(removal).catch((e) =>
          console.warn("AsyncStorage.multiRemove failed:", e)
        );
      }
    } catch (e) {
      console.warn("Local storage clear failed:", e);
    }

    try {
      const noOauthConfig = JSON.parse(JSON.stringify(getAuthConfig()));
      try {
        if (noOauthConfig?.Auth?.Cognito?.loginWith?.oauth) {
          delete noOauthConfig.Auth.Cognito.loginWith.oauth;
        }
      } catch (err) {
        /* ignore */
      }

      Amplify.configure(noOauthConfig);

      try {
        // @ts-ignore
        await signOut({ global: false }).catch((e: any) =>
          console.debug("non-redirecting signOut failed:", e)
        );
      } catch (err) {
        console.debug("signOut call failed (non-fatal):", err);
      }

      Amplify.configure(getAuthConfig());
    } catch (e) {
      console.warn("Non-redirecting signOut attempt failed:", e);
    }

    try {
      Hub.dispatch("auth", { event: "signedOut" }, "Auth");
    } catch (e) {
      console.warn("Hub.dispatch signedOut failed:", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const pending = await getPendingSignup();
        if (pending?.username) {
          safeNavigate(
            `/confirm?username=${encodeURIComponent(
              pending.username
            )}&password=${encodeURIComponent(
              pending.password ?? ""
            )}&email=${encodeURIComponent(pending.email ?? "")}`
          );
          return;
        }
      } catch (err) {
        console.warn("Failed to read pending signup in AuthProvider", err);
      }

      checkProfile();
    })();
  }, [checkProfile]);

  useEffect(() => {
    if (Hub && typeof Hub.listen === "function") {
      const listener = Hub.listen("auth", ({ payload }) => {
        const eventsToCheck = [
          "signIn",
          "signInWithRedirect",
          "signIn_failure",
          "signOut",
          "signedOut",
        ];
        if (eventsToCheck.includes(payload.event)) {
          setTimeout(checkProfile, 500);
        }
      });

      return () => {
        try {
          listener();
        } catch (err) {
          /* ignore */
        }
      };
    }

    return undefined;
  }, [checkProfile]);

  const ctx: AuthContextType = React.useMemo(
    () => ({
      checkingProfile,
      sub,
      profile,
      profileStatus,
      checkProfile,
      signOutLocal,
    }),
    [checkingProfile, sub, profile, profileStatus, checkProfile, signOutLocal]
  );

  return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>;
}
