import { fetchAuthSession, getCurrentUser, signOut } from "aws-amplify/auth";
import { Amplify, Hub } from "aws-amplify";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

  const handleSignOut = async () => {
    try {
      setLoading(true);

      // Attempt a pure local sign-out by clearing stored Auth tokens directly and
      // dispatching an auth 'signedOut' event — avoids invoking the Hosted UI.
      try {
        const keys = await AsyncStorage.getAllKeys();
        const removal = keys.filter((k) =>
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
        // Instruct Amplify that the user is signed out
        Hub.dispatch("auth", { event: "signedOut" }, "Auth");
      } catch (e) {
        console.warn("Hub.dispatch signedOut failed:", e);
      }

      router.replace("/login");
    } catch (err: any) {
      console.warn("Sign out error (fallback), navigating to login", err);
      router.replace("/login");
    } finally {
      setLoading(false);
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
