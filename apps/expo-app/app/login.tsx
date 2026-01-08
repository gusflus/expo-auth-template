import { signIn, signInWithRedirect, signUp } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type AuthMode = "signin" | "signup" | "confirm";

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Listen for auth events (OAuth redirect flows)
    const hubListener = Hub.listen("auth", ({ payload }) => {
      // No direct navigation here — AuthProvider handles redirects centrally
      if (payload.event === "signedOut") {
        // noop
      }
    });
    setLoading(false);
    return () => hubListener();
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

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const apiUrl = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;
      const response = await fetch(`${apiUrl}/apple-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityToken: credential.identityToken }),
      });

      if (response.status === 409) {
        const conflict = await response.json().catch(() => null);
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

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Backend error: ${response.status} - ${text}`);
      }

      // Success — go to logged-in page
      router.replace("/logged-in");
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
      Alert.alert("Sign Up Error", error.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
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
});
