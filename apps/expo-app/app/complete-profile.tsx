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

export default function CompleteProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<string | null>(null);

  // Fields we care about
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [firstName, setFirstName] = useState<string | undefined>(undefined);
  const [lastName, setLastName] = useState<string | undefined>(undefined);

  // Which fields were missing on initial load (keeps inputs visible while editing)
  const [initialMissing, setInitialMissing] = useState<
    ("username" | "email" | "firstName" | "lastName")[]
  >([]);

  const apiBase = process.env.EXPO_PUBLIC_APPLE_AUTH_API_URL;

  useEffect(() => {
    (async () => {
      try {
        const session = await fetchAuthSession();
        const idTokenObj = (session as any)?.tokens?.idToken;
        const payload = idTokenObj?.payload ?? {};
        const mySub = payload.sub || (await getCurrentUser()).userId;
        setSub(mySub);

        // Pre-fill from id token if present
        if (payload.email) setEmail(payload.email);
        if (payload.name) {
          // try to split into first/last
          const parts = (payload.name as string).split(" ");
          if (parts.length) setFirstName(parts[0]);
          if (parts.length > 1) setLastName(parts.slice(1).join(" "));
        }
        if (payload.given_name) setFirstName(payload.given_name);
        if (payload.family_name) setLastName(payload.family_name);
        if (payload["cognito:username"])
          setUsername(payload["cognito:username"]);

        // Fetch existing profile from our API (Dynamo) to see what's stored
        if (apiBase && mySub) {
          const resp = await fetch(
            `${apiBase}/user?sub=${encodeURIComponent(mySub)}`
          );
          if (resp.ok) {
            const body = await resp.json().catch(() => ({}));
            const item = body.item ?? {};
            if (item.email) setEmail(item.email);
            if (item.username) setUsername(item.username);
            if (item.firstName) setFirstName(item.firstName);
            if (item.lastName) setLastName(item.lastName);

            // Record which fields were missing on initial load so they remain visible while editing
            const initMissing: (
              | "username"
              | "email"
              | "firstName"
              | "lastName"
            )[] = [];
            if (!item.username) initMissing.push("username");
            if (!item.email) initMissing.push("email");
            if (!item.firstName) initMissing.push("firstName");
            if (!item.lastName) initMissing.push("lastName");
            setInitialMissing(initMissing);
          } else {
            // No server-side item: derive missing fields from token/pre-filled values
            const initMissing: (
              | "username"
              | "email"
              | "firstName"
              | "lastName"
            )[] = [];
            if (!username) initMissing.push("username");
            if (!email) initMissing.push("email");
            if (!firstName) initMissing.push("firstName");
            if (!lastName) initMissing.push("lastName");
            setInitialMissing(initMissing);
          }
        }
      } catch (err) {
        console.warn("complete-profile init error", err);
        // If not authenticated, bounce back to login
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [apiBase, router]);

  // Determine which fields are missing and need user input
  const missingFields = (): (
    | "username"
    | "email"
    | "firstName"
    | "lastName"
  )[] => {
    const missing: ("username" | "email" | "firstName" | "lastName")[] = [];
    if (!username) missing.push("username");
    if (!email) missing.push("email");
    if (!firstName) missing.push("firstName");
    if (!lastName) missing.push("lastName");
    return missing;
  };

  const handleSave = async () => {
    if (!sub) return;
    const toSave: any = { sub };
    if (username) toSave.username = username;
    if (email) toSave.email = email;
    if (firstName) toSave.firstName = firstName;
    if (lastName) toSave.lastName = lastName;

    setSaving(true);
    try {
      const resp = await fetch(`${apiBase}/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSave),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      // On success, go to logged-in page
      router.replace("/logged-in");
    } catch (err: any) {
      console.error("Save error", err);
      Alert.alert("Save Error", err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading profile...</Text>
      </View>
    );
  }

  const need = initialMissing.length ? initialMissing : missingFields();
  if (!need.length) {
    // Nothing missing — go to logged-in
    router.replace("/logged-in");
    return null;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 40 }}
    >
      <Text style={styles.title}>Complete Your Profile</Text>
      <Text style={{ marginBottom: 10 }}>
        Please provide the missing information so we can finish setting up your
        account.
      </Text>

      {need.includes("username") && (
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username ?? ""}
          onChangeText={setUsername as any}
          autoCapitalize="none"
        />
      )}
      {need.includes("email") && (
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email ?? ""}
          onChangeText={setEmail as any}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      )}
      {need.includes("firstName") && (
        <TextInput
          style={styles.input}
          placeholder="First name"
          value={firstName ?? ""}
          onChangeText={setFirstName as any}
        />
      )}
      {need.includes("lastName") && (
        <TextInput
          style={styles.input}
          placeholder="Last name"
          value={lastName ?? ""}
          onChangeText={setLastName as any}
        />
      )}

      <TouchableOpacity
        style={[styles.button, saving ? { opacity: 0.6 } : {}]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? "Saving..." : "Save"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace("/logged-in")}>
        <Text style={styles.linkText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
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
  buttonText: { color: "#fff", fontWeight: "600" },
  linkText: { color: "#007AFF", textAlign: "center" },
});
