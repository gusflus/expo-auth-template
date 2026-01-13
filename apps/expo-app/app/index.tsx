import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signInWithRedirect,
  signUp,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useAuth } from "auth";

type AuthMode = "signin" | "signup" | "confirm";

export default function HomeScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuthState();

    // Listen for auth events
    const hubListener = Hub.listen("auth", ({ payload }) => {
      switch (payload.event) {
        case "signInWithRedirect":
          checkAuthState();
          break;
        case "signInWithRedirect_failure":
          console.error("Sign in failed:", payload.data);
          setLoading(false);
          break;
        case "signedOut":
          setUser(null);
          setLoading(false);
          break;
      }
    });

    return () => hubListener();
  }, []);

  const checkAuthState = async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();

      let userInfo = {
        userId: currentUser.userId,
        username: currentUser.username,
        attributes: {},
      };

      // Get user info from ID token for OAuth users
      if (session.tokens?.idToken) {
        const payload = session.tokens.idToken.payload;
        userInfo.attributes = {
          email: payload.email,
          name: payload.name,
          given_name: payload.given_name,
          family_name: payload.family_name,
        };
      }

      // Try to extract a raw ID token string (may be present on OAuth flows)
      const idTokenObj = (session as any)?.tokens?.idToken;
      // Prefer calling toString() if available (some SDKs return a Token object)
      const tokenStr =
        idTokenObj?.toString?.() ??
        idTokenObj?.jwtToken ??
        idTokenObj?.raw ??
        idTokenObj?.token ??
        null;
      console.log("Extracted ID token:", tokenStr, "from", idTokenObj);
      setJwtToken(tokenStr ?? null);

      setUser(userInfo);
    } catch (error) {
      console.log("Not authenticated:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

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

      // Use native Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      console.log("Apple credential received:", {
        identityToken: credential.identityToken ? "present" : "missing",
        user: credential.user,
      });

      // Send the identity token to our backend
      const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
      console.log("Calling API:", apiUrl);

      const response = await fetch(`${apiUrl}/apple-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identityToken: credential.identityToken,
        }),
      });

      console.log("API response status:", response.status);
      const responseText = await response.text();
      console.log("API response body:", responseText);

      if (response.status === 409) {
        // Provider conflict — prompt the user to sign in with the existing provider
        try {
          const conflict = JSON.parse(responseText);
          const existing = conflict.existingProviders || [];

          if (
            existing.some((p: string) => p.toLowerCase().includes("google"))
          ) {
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
              `${conflict.message}\nProviders: ${existing.join(", ")}`
            );
          }
        } catch (err) {
          Alert.alert(
            "Account exists",
            "An account with this email exists using a different provider."
          );
        }
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status} - ${responseText}`);
      }

      const authResult = JSON.parse(responseText);

      // Store the credentials and user info
      console.log("Authentication successful:", authResult);

      // Update user state
      setUser({
        userId: authResult.identityId,
        username: authResult.userInfo.sub,
        attributes: {
          email: authResult.userInfo.email,
          email_verified: authResult.userInfo.email_verified,
        },
      });

      // Store the Apple identity token locally so the user can view it
      setJwtToken(credential.identityToken ?? null);
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") {
        console.log("User cancelled Apple Sign In");
        setLoading(false);
      } else {
        console.error("Apple Sign In Error:", e);
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
      await checkAuthState();
    } catch (error: any) {
      Alert.alert("Sign In Error", error.message);
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

      // Pre-flight: check if the email already exists (and whether it's associated with other providers)
      const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
      if (apiUrl) {
        const resp = await fetch(`${apiUrl}/check-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (resp.status === 409) {
          // Provider conflict — prompt the user to sign in with the existing provider
          try {
            const conflict = await resp.json();
            const existing = conflict.existingProviders || [];

            if (
              existing.some((p: string) => p.toLowerCase().includes("google"))
            ) {
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
                `${conflict.message}\nProviders: ${existing.join(", ")}`
              );
            }
          } catch (err) {
            Alert.alert(
              "Account exists",
              "An account with this email exists using a different provider."
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
        options: {
          userAttributes: {
            email,
          },
        },
      });
      console.log("signUp succeeded (index)", { username, email });

      // Persist pending signup so the confirmation step can be restored after an app restart
      try {
        console.log("index: attempting to persist pending signup", {
          username,
          email,
        });
        await (
          await import("auth")
        ).setPendingSignup({ username, password, email });
        console.log("index: pending signup persisted for", username);
        if (__DEV__) {
          Alert.alert("Dev", "Pending signup persisted (index)");
        }
      } catch (err) {
        console.warn("Failed to persist pending signup", err);
      }

      setAuthMode("confirm");
      setLoading(false);
      Alert.alert(
        "Success",
        "Please check your email for the confirmation code"
      );
    } catch (error: any) {
      Alert.alert("Sign Up Error", error.message);
      setLoading(false);
    }
  };

  const handleConfirmSignUp = async () => {
    try {
      setLoading(true);
      await confirmSignUp({
        username,
        confirmationCode,
      });
      Alert.alert("Success", "Account confirmed! You can now sign in.");
      setAuthMode("signin");
      setConfirmationCode("");
    } catch (error: any) {
      Alert.alert("Confirmation Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const { signOutLocal } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOutLocal();
      setUser(null);
      setJwtToken(null);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // Check auth state locally (no navigation here — `AuthProvider` will perform redirects)
  useEffect(() => {
    (async () => {
      try {
        const session = await fetchAuthSession();
        const idTokenObj = (session as any)?.tokens?.idToken;
        const tokenStr =
          idTokenObj?.toString?.() ??
          idTokenObj?.jwtToken ??
          idTokenObj?.raw ??
          idTokenObj?.token ??
          null;
        setJwtToken(tokenStr ?? null);
      } catch (err) {
        setJwtToken(null);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text>Redirecting...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  form: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  googleButton: {
    backgroundColor: "#4285f4",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  appleButton: {
    backgroundColor: "#000",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  signOutButton: {
    backgroundColor: "#dc3545",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  linkText: {
    color: "#007bff",
    textAlign: "center",
    fontSize: 14,
    marginTop: 10,
  },
  divider: {
    textAlign: "center",
    fontSize: 16,
    color: "#666",
    marginVertical: 20,
  },
  userInfo: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
});
