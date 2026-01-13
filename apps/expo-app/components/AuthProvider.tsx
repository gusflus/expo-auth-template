import AsyncStorage from "@react-native-async-storage/async-storage";
import { Amplify } from "aws-amplify";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useRouter } from "expo-router";
import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { authConfig } from "../lib/amplify-config";
import { getPendingSignup } from "../lib/pendingSignup";

Amplify.configure(authConfig);

interface AuthProviderProps {
  children: ReactNode;
}

export type Profile = {
  username?: string;
  email: string;
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
        console.debug("AuthProvider: checking profile (attempt)", attempt);
        const session = await fetchAuthSession();
        const idTokenObj = (session as any)?.tokens?.idToken;
        const resolvedSub =
          idTokenObj?.payload?.sub || (await getCurrentUser())?.userId;
        console.debug("AuthProvider: sub=", resolvedSub);

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

        console.debug("AuthProvider: get-user status=", resp.status);
        if (resp.status === 403) {
          // Incomplete profile
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
          // navigate to complete-profile with helpful params
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
          const body = await resp.json().catch(() => ({}));
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
        console.warn("profile check failed (attempt)", attempt, msg);

        if (
          /(User needs to be authenticated|UserNotAuthenticated|UserNotAuthenticatedException)/i.test(
            msg
          ) &&
          attempt < MAX_ATTEMPTS
        ) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        safeNavigate("/login");
        setCheckingProfile(false);
        return;
      }
    }

    // exhausted
    safeNavigate("/login");
    setCheckingProfile(false);
  }, [router, safeNavigate]);

  const signOutLocal = useCallback(async () => {
    // Remove common storage keys used by Amplify
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
      Hub.dispatch("auth", { event: "signedOut" }, "Auth");
    } catch (e) {
      console.warn("Hub.dispatch signedOut failed:", e);
    }
  }, []);

  // Check for a pending signup first — if found, restore the confirmation flow
  useEffect(() => {
    (async () => {
      try {
        const pending = await getPendingSignup();
        if (pending?.username) {
          console.log(
            "AuthProvider: restoring pending signup",
            pending.username
          );
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
  }, [checkProfile, safeNavigate]);

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
