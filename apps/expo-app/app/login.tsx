import {
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signUp,
} from "aws-amplify/auth";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../components/AuthProvider";
import {
  clearPendingSignup,
  getPendingSignup,
  setPendingSignup,
} from "../lib/pendingSignup";

type AuthMode = "signin" | "signup" | "confirm";

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { checkingProfile } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Login component no longer listens to Hub; AuthProvider centralizes auth events.
    // Show spinner while the global auth check is in progress to avoid user confusion.
    if (checkingProfile) setLoading(true);
    else setLoading(false);
  }, [checkingProfile]);

  // Defensive check: if a pending signup exists on app start, restore the confirm flow
  useEffect(() => {
    (async () => {
      try {
        const pending = await getPendingSignup();
        if (pending?.username) {
          router.replace(
            `/confirm?username=${encodeURIComponent(
              pending.username
            )}&password=${encodeURIComponent(
              pending.password ?? ""
            )}&email=${encodeURIComponent(pending.email ?? "")}`
          );
        }
      } catch (err) {
        console.warn("Failed to read pending signup in Login mount", err);
      }
    })();
  }, [router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithRedirect({ provider: "Google" });
    } catch (error) {
      console.error("Sign in error:", error);
      setLoading(false);
    }
  };

  const handleNativeAppleSignIn = async () => {
    try {
      setLoading(true);

      // const credential = await AppleAuthentication.signInAsync({
      //   requestedScopes: [
      //     AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      //     AppleAuthentication.AppleAuthenticationScope.EMAIL,
      //   ],
      // });

      // const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
      // const response = await fetch(`${apiUrl}/apple-auth`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ identityToken: credential.identityToken }),
      // });

      // if (response.status === 409) {
      //   const conflict = await response.json().catch(() => null);
      //   const existing = (conflict?.existingProviders || []) as string[];
      //   if (existing.some((p) => p.toLowerCase().includes("google"))) {
      //     Alert.alert(
      //       "Account exists",
      //       "An account with this email exists using Google. Would you like to sign in with Google instead?",
      //       [
      //         { text: "Sign in with Google", onPress: handleGoogleSignIn },
      //         { text: "Cancel", style: "cancel" },
      //       ]
      //     );
      //   } else {
      //     Alert.alert(
      //       "Account exists",
      //       conflict?.message || "Please sign in with your existing provider."
      //     );
      //   }
      //   setLoading(false);
      //   return;
      // }

      // if (!response.ok) {
      //   const text = await response.text();
      //   throw new Error(`Backend error: ${response.status} - ${text}`);
      // }

      // // Success — use Hosted UI redirect for Apple since the modular Amplify build
      // // used here doesn't expose `Auth.federatedSignIn`. This keeps parity with
      // // Google (which uses Hosted UI via `signInWithRedirect`).
      // console.debug(
      //   "Apple Sign In: falling back to Hosted UI redirect (signInWithRedirect)"
      // );
      try {
        // Use the Amplify provider name configured in `amplify-config` ("Apple")
        await signInWithRedirect({ provider: "Apple" });
        // Hosted UI will redirect back and AuthProvider will handle navigation on sign-in events
        setLoading(false);
        return;
      } catch (err) {
        console.warn("signInWithRedirect failed:", err);
        Alert.alert(
          "Apple Sign In Error",
          "Failed to start Hosted UI sign-in. Please try again."
        );
        setLoading(false);
        return;
      }
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") {
        setLoading(false);
      } else {
        Alert.alert("Apple Sign In Error", e.message);
        setLoading(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    try {
      setLoading(true);
      await signIn({ username: email, password });
      router.replace("/logged-in");
    } catch (error: any) {
      const msg = error?.message ?? String(error);

      // If the user exists but the email is unconfirmed, resend the code and take them to the confirm screen
      if (
        error?.code === "UserNotConfirmedException" ||
        /not confirm/i.test(msg)
      ) {
        try {
          await resendSignUpCode({ username: email });
        } catch (err) {
          console.warn("resendSignUpCode failed:", err);
        }

        try {
          await setPendingSignup({ username: email, password, email });
        } catch (err) {
          console.warn("Failed to persist pending signup on resend", err);
        }

        router.push(
          `/confirm?username=${encodeURIComponent(
            email
          )}&password=${encodeURIComponent(
            password
          )}&email=${encodeURIComponent(email)}`
        );

        // Navigated to confirmation; the confirmation screen will guide the user
        setLoading(false);
        return;
      }

      // If user not found while a pending signup exists for this input, restore confirmation flow instead
      if (
        error?.code === "UserNotFoundException" ||
        /does not exist|not found|user not found/i.test(msg)
      ) {
        try {
          const pending = await getPendingSignup();
          if (
            pending &&
            (pending.email === email || pending.username === email)
          ) {
            const target = pending.username ?? email;
            try {
              await resendSignUpCode({ username: target });
            } catch (err) {
              console.warn(
                "resendSignUpCode failed in not-found recovery:",
                err
              );
            }

            try {
              await setPendingSignup({
                username: target,
                password: pending.password ?? password,
                email: pending.email ?? email,
              });
            } catch (err) {
              console.warn(
                "Failed to persist pending signup during recovery",
                err
              );
            }

            router.push(
              `/confirm?username=${encodeURIComponent(
                target
              )}&password=${encodeURIComponent(
                pending.password ?? password
              )}&email=${encodeURIComponent(pending.email ?? email)}`
            );

            // Navigated to confirmation; the confirmation screen will guide the user
            setLoading(false);
            return;
          }

          // No locally-saved pending signup matched — try backend email lookup to find the Cognito username for this email
          const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
          if (apiUrl && email) {
            try {
              const resp = await fetch(`${apiUrl}/check-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });

              if (resp.status === 409) {
                const conflict = await resp.json().catch(() => null);
                const poolUsername = conflict?.userPoolUsername;
                console.log("check-email response: 409", {
                  poolUsername,
                  conflict,
                });
                if (poolUsername) {
                  try {
                    await resendSignUpCode({ username: poolUsername });
                  } catch (err) {
                    console.warn(
                      "resendSignUpCode failed for pooled username:",
                      err
                    );
                  }

                  try {
                    await setPendingSignup({
                      username: poolUsername,
                      password,
                      email,
                    });
                  } catch (err) {
                    console.warn(
                      "Failed to persist pending signup during backend recovery",
                      err
                    );
                  }

                  router.push(
                    `/confirm?username=${encodeURIComponent(
                      poolUsername
                    )}&password=${encodeURIComponent(
                      password
                    )}&email=${encodeURIComponent(email)}`
                  );

                  // Navigated to confirmation; the confirmation screen will guide the user
                  setLoading(false);
                  return;
                }
              }
            } catch (err) {
              console.warn(
                "check-email lookup failed during sign-in recovery",
                err
              );
            }
          }
        } catch (err) {
          console.warn(
            "Error checking pending signup during sign-in recovery",
            err
          );
        }
      }

      // If a pending signup exists for these credentials, restore the confirm flow (defensive fallback)
      try {
        const pending = await getPendingSignup();
        if (
          pending &&
          (pending.email === email || pending.username === email)
        ) {
          const target = pending.username ?? email;
          try {
            await resendSignUpCode({ username: target });
          } catch (err) {
            console.warn("resendSignUpCode failed in fallback:", err);
          }

          try {
            await setPendingSignup({
              username: target,
              password: pending.password ?? password,
              email: pending.email ?? email,
            });
          } catch (err) {
            console.warn(
              "Failed to persist pending signup during fallback",
              err
            );
          }

          router.push(
            `/confirm?username=${encodeURIComponent(
              target
            )}&password=${encodeURIComponent(
              pending.password ?? password
            )}&email=${encodeURIComponent(pending.email ?? email)}`
          );

          // Navigated to confirmation; the confirmation screen will guide the user
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Error checking pending signup fallback", err);
      }

      // As a last resort, try resending using the supplied identifier (email or username)
      try {
        await resendSignUpCode({ username: email });
        await setPendingSignup({ username: email, password, email });
        router.push(
          `/confirm?username=${encodeURIComponent(
            email
          )}&password=${encodeURIComponent(
            password
          )}&email=${encodeURIComponent(email)}`
        );
        // Navigated to confirmation as a recovery attempt; the confirmation screen will guide the user
        setLoading(false);
        return;
      } catch (err) {
        console.debug(
          "resendSignUpCode fallback did not succeed for identifier",
          email,
          err
        );
      }

      console.error("Sign in final error:", error);
      Alert.alert("Sign In Error", msg);
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    try {
      if (!username) {
        Alert.alert("Validation Error", "Please enter a username");
        return;
      }
      setLoading(true);

      // Optional: check backend for existing email (same as before)
      const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
      if (apiUrl) {
        const resp = await fetch(`${apiUrl}/check-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (resp.status === 409) {
          const conflict = await resp.json().catch(() => null);

          // If the email maps to an unconfirmed Cognito user, automatically replace it (delete old UNCONFIRMED account and continue)
          if (conflict?.userStatus === "UNCONFIRMED") {
            console.log(
              "check-email: unconfirmed account found; attempting replace",
              { userPoolUsername: conflict?.userPoolUsername }
            );
            try {
              const replaceResp = await fetch(`${apiUrl}/replace-unconfirmed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });

              if (replaceResp.ok) {
                console.log("replace-unconfirmed succeeded for", email);
                // After replacing, retry signUp with the new credentials
                try {
                  await signUp({
                    username,
                    password,
                    options: { userAttributes: { email } },
                  });
                  console.log("signUp succeeded after replace", {
                    username,
                    email,
                  });

                  try {
                    await setPendingSignup({ username, password, email });
                  } catch (err) {
                    console.warn(
                      "Failed to persist pending signup after replace",
                      err
                    );
                  }

                  router.push(
                    `/confirm?username=${encodeURIComponent(
                      username
                    )}&password=${encodeURIComponent(
                      password
                    )}&email=${encodeURIComponent(email)}`
                  );
                  setLoading(false);
                  Alert.alert(
                    "Success",
                    "Please check your email for the confirmation code."
                  );
                  return;
                } catch (err: any) {
                  console.warn("Sign up failed after replace-unconfirmed", err);
                  // Fall through to show conflict message below
                }
              } else {
                const text = await replaceResp.text().catch(() => null);
                console.warn(
                  "replace-unconfirmed failed",
                  replaceResp.status,
                  text
                );
                // Fall through to normal messaging
              }
            } catch (err) {
              console.warn("replace-unconfirmed request failed", err);
              // Fall through to normal messaging
            }
          }

          const existing = (conflict?.existingProviders || []) as string[];
          if (existing.some((p) => p.toLowerCase().includes("google"))) {
            Alert.alert(
              "Account exists",
              "An account with this email exists using Google. Would you like to sign in with Google instead?",
              [
                { text: "Sign in with Google", onPress: handleGoogleSignIn },
                { text: "Cancel", style: "cancel" },
              ]
            );
          } else {
            Alert.alert(
              "Account exists",
              conflict?.message || "Please sign in with your existing provider."
            );
          }
          setLoading(false);
          return;
        }

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Email check failed: ${resp.status} - ${text}`);
        }
      }

      await signUp({
        username,
        password,
        options: { userAttributes: { email } },
      });
      console.log("signUp succeeded", { username, email });

      // Persist pending signup so the confirmation screen can be restored if the app is quit
      try {
        console.log("attempting to persist pending signup", {
          username,
          email,
        });
        await setPendingSignup({ username, password, email });
        console.log("pending signup persisted for", username);
        if (__DEV__) {
          Alert.alert("Dev", "Pending signup persisted");
        }
      } catch (err) {
        console.warn("Failed to persist pending signup", err);
      }

      // Redirect to the confirmation page and pass the temporary credentials so we can sign-in automatically
      router.push(
        `/confirm?username=${encodeURIComponent(
          username
        )}&password=${encodeURIComponent(password)}&email=${encodeURIComponent(
          email
        )}`
      );
      setLoading(false);
      Alert.alert(
        "Success",
        "Please check your email for the confirmation code"
      );
    } catch (error: any) {
      const msg = error?.message ?? String(error);

      // If username already exists, it may be an unfinished signup — try to resend code and take them to confirm
      if (
        error?.code === "UsernameExistsException" ||
        /already exists|user exists/i.test(msg)
      ) {
        const target = username || email;
        // First, try the naive resend (username field) — it might succeed if they used username directly
        try {
          await resendSignUpCode({ username: target });
          await setPendingSignup({ username: target, password, email });

          router.push(
            `/confirm?username=${encodeURIComponent(
              target
            )}&password=${encodeURIComponent(
              password
            )}&email=${encodeURIComponent(email)}`
          );

          // Navigated to confirmation; the confirmation screen will guide the user
          setLoading(false);
          return;
        } catch (err: any) {
          console.warn(
            "Resend attempt failed during signup error handling (naive):",
            err
          );
          // If that fails, try looking up the username by email on the backend
          const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
          if (apiUrl && email) {
            try {
              const resp = await fetch(`${apiUrl}/check-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });

              if (resp.status === 409) {
                const conflict = await resp.json().catch(() => null);
                const poolUsername = conflict?.userPoolUsername;
                console.log(
                  "check-email response during signup recovery: 409",
                  { poolUsername, conflict }
                );
                if (poolUsername) {
                  try {
                    await resendSignUpCode({ username: poolUsername });
                  } catch (err: any) {
                    console.warn(
                      "Resend attempt failed during signup error handling (backend lookup):",
                      err
                    );
                  }

                  try {
                    await setPendingSignup({
                      username: poolUsername,
                      password,
                      email,
                    });
                  } catch (err) {
                    console.warn(
                      "Failed to persist pending signup during backend recovery (signup)",
                      err
                    );
                  }

                  router.push(
                    `/confirm?username=${encodeURIComponent(
                      poolUsername
                    )}&password=${encodeURIComponent(
                      password
                    )}&email=${encodeURIComponent(email)}`
                  );

                  // Navigated to confirmation; the confirmation screen will guide the user
                  setLoading(false);
                  return;
                }
              }
            } catch (err) {
              console.warn(
                "check-email lookup failed during signup recovery",
                err
              );
            }
          }
        }
      }

      console.error("Sign up error:", error);
      Alert.alert("Sign Up Error", msg);
      setLoading(false);
    }
  };

  if (loading || checkingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Completing sign-in…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Expo Auth Demo</Text>

      <TouchableOpacity
        style={styles.googleButton}
        onPress={handleGoogleSignIn}
      >
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.appleButton}
        onPress={handleNativeAppleSignIn}
      >
        <Text style={styles.buttonText}>Sign in with Apple</Text>
      </TouchableOpacity>

      <Text style={styles.divider}>OR</Text>

      <View style={styles.form}>
        <Text style={styles.formTitle}>
          {authMode === "signin" ? "Sign In" : "Sign Up"}
        </Text>
        {authMode === "signup" && (
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.button}
          onPress={
            authMode === "signin" ? handleEmailSignIn : handleEmailSignUp
          }
        >
          <Text style={styles.buttonText}>
            {authMode === "signin" ? "Sign In" : "Sign Up"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            setAuthMode(authMode === "signin" ? "signup" : "signin")
          }
        >
          <Text style={styles.linkText}>
            {authMode === "signin"
              ? "Don't have an account? Sign Up"
              : "Already have an account? Sign In"}
          </Text>
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            onPress={async () => {
              try {
                const pending = await getPendingSignup();
                Alert.alert(
                  "Pending Signup",
                  pending ? JSON.stringify(pending, null, 2) : "<none>",
                  [
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: async () => {
                        await clearPendingSignup();
                        Alert.alert("Cleared");
                      },
                    },
                    { text: "OK", style: "cancel" },
                  ]
                );
              } catch (err) {
                Alert.alert("Error", "Failed to read pending signup");
              }
            }}
          >
            <Text style={[styles.linkText, { color: "#999" }]}>
              Dev: View Pending Signup
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  divider: { textAlign: "center", marginVertical: 12 },
  form: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  googleButton: {
    backgroundColor: "#DB4437",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  appleButton: {
    backgroundColor: "#000",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  linkText: { color: "#007AFF", textAlign: "center", marginTop: 6 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#333",
  },
});
