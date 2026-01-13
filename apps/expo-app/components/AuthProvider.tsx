import { Amplify } from "aws-amplify";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useRouter } from "expo-router";
import { ReactNode, useEffect } from "react";
import { authConfig } from "../lib/amplify-config";
import { getPendingSignup } from "../lib/pendingSignup";

// Configure Amplify
Amplify.configure(authConfig);

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();

  useEffect(() => {
    const API_BASE = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
    const lastNavRef = { current: null as string | null } as {
      current: string | null;
    };

    const safeNavigate = (path: string) => {
      if (lastNavRef.current === path) return;
      try {
        router.replace(path);
        lastNavRef.current = path;
        setTimeout(() => (lastNavRef.current = null), 1200);
      } catch (err) {
        console.warn("navigation failed", err);
      }
    };

    const checkProfile = async () => {
      const MAX_ATTEMPTS = 5;
      let attempt = 0;
      while (attempt < MAX_ATTEMPTS) {
        try {
          attempt++;
          console.debug("AuthProvider: checking profile (attempt)", attempt);
          const session = await fetchAuthSession();
          const idTokenObj = (session as any)?.tokens?.idToken;
          const sub =
            idTokenObj?.payload?.sub || (await getCurrentUser())?.userId;
          console.debug("AuthProvider: sub=", sub);

          if (!sub) {
            // Not authenticated yet — possibly transient during redirect. Retry a few times.
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 400));
              continue;
            }
            safeNavigate("/login");
            return;
          }

          if (!API_BASE) return;

          const resp = await fetch(
            `${API_BASE}/user?sub=${encodeURIComponent(sub)}`,
            {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            }
          );

          console.debug("AuthProvider: get-user status=", resp.status);
          if (resp.status === 403) {
            // Profile incomplete — force completion page
            // Attempt to include helpful prefill data from the id token so the
            // CompleteProfile screen can render immediately without waiting on
            // the backend fetch.
            const payload = idTokenObj?.payload ?? {};
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
            return;
          } else if (resp.ok) {
            // Profile is complete — proceed to logged-in area
            safeNavigate("/logged-in");
            return;
          } else {
            // Unexpected response — log and fall back to login to recover
            console.warn(
              "AuthProvider: unexpected get-user response",
              resp.status
            );
            safeNavigate("/login");
            return;
          }
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          console.warn("profile check failed (attempt)", attempt, msg);

          // Retry on authentication-not-ready errors
          if (
            /(User needs to be authenticated|UserNotAuthenticated|UserNotAuthenticatedException)/i.test(
              msg
            ) &&
            attempt < MAX_ATTEMPTS
          ) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }

          // On other errors or exhausted attempts, send to login to recover
          safeNavigate("/login");
          return;
        }
      }

      // Exhausted attempts — navigate to login
      safeNavigate("/login");
    };

    // Check for a pending signup first — if found, restore the confirmation flow
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

      // Run once on mount
      checkProfile();
    })();

    // Run on auth events (sign-in / sign-out)
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
  }, [router]);

  return <>{children}</>;
}
