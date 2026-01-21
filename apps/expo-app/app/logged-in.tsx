import { useAuth } from "@/auth";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
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

export default function LoggedInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await getCurrentUser();
        const session = await fetchAuthSession();
        const idTokenObj = (session as any)?.tokens?.idToken;
        const tokenStr =
          idTokenObj?.toString?.() ??
          idTokenObj?.jwtToken ??
          idTokenObj?.raw ??
          idTokenObj?.token ??
          null;
        setJwtToken(tokenStr ?? null);
        setUser({
          userId: currentUser.userId,
          username: currentUser.username,
          attributes: idTokenObj?.payload
            ? {
                email: idTokenObj.payload.email,
                name: idTokenObj.payload.name,
                given_name: idTokenObj.payload.given_name,
              }
            : {},
        });
      } catch (err) {
        console.warn("Not authenticated, redirecting to login", err);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const { signOutLocal } = useAuth();

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOutLocal();
      router.replace("/login");
    } catch (err: any) {
      console.warn("Sign out error (fallback), navigating to login", err);
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleTestAuthenticatedRequest = async () => {
    try {
      setApiLoading(true);
      setApiResponse("Making authenticated API request...");
      // This is a test request - modify the endpoint based on your actual API
      const token = jwtToken;
      if (!token) {
        Alert.alert("Error", "No auth token available");
        return;
      }

      const response = await fetch(
        (process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000") +
          "/protected",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
      Alert.alert("Success", JSON.stringify(data, null, 2));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to make API request";
      setApiResponse(errorMsg);
      Alert.alert("Error", errorMsg);
    } finally {
      setApiLoading(false);
    }
  };

  if (loading)
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome!</Text>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.userInfo}>
        <Text style={styles.sectionTitle}>User Info</Text>
        <Text>User ID: {user?.userId}</Text>
        <Text>Email: {user?.attributes?.email}</Text>
        {user?.attributes?.name && <Text>Name: {user.attributes.name}</Text>}
      </View>

      <View style={styles.userInfo}>
        <Text style={styles.sectionTitle}>JWT</Text>
        <TextInput
          style={[styles.input, { height: 120 }]}
          multiline
          value={jwtToken ?? ""}
          editable={false}
        />
      </View>

      <View style={styles.userInfo}>
        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: "#34C759" }]}
          onPress={handleTestAuthenticatedRequest}
          disabled={apiLoading}
        >
          <Text style={styles.buttonText}>
            {apiLoading ? "Testing..." : "Dev: Test Authenticated API"}
          </Text>
        </TouchableOpacity>

        {apiResponse && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>API Response:</Text>
            <TextInput
              style={[styles.input, { height: 100 }]}
              multiline
              value={apiResponse}
              editable={false}
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
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
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  userInfo: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  signOutButton: { backgroundColor: "#ff3b30", padding: 8, borderRadius: 6 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
