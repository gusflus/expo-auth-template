import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useAuth } from "auth";

export default function CompleteProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<string | null>(null);

  const { sub: authSub, profile, checkingProfile, checkProfile } = useAuth();

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

  // No automatic redirect: the user must confirm and click Save to complete their profile.

  // Use any prefill query params first so the UI appears instantly after redirect
  const params = useLocalSearchParams();

  useEffect(() => {
    // Disabled: profile logic moved to AuthProvider; keep effect noop to maintain behavior
    return; // original flow is now handled by AuthProvider
    (async () => {
      try {
        // Apply immediate prefill values from query params (if provided)
        if (params.email) setEmail(params.email as string);
        if (params.firstName) setFirstName(params.firstName as string);
        if (params.lastName) setLastName(params.lastName as string);

        const session = await fetchAuthSession();
        const idTokenObj = (session as any)?.tokens?.idToken;
        const payload = idTokenObj?.payload ?? {};
        const mySub = payload.sub || (await getCurrentUser()).userId;
        setSub(mySub);

        // Pre-fill from id token if present (doesn't overwrite query params)
        if (!email && payload.email) setEmail(payload.email);
        if (!firstName && payload.name) {
          // try to split into first/last
          const parts = (payload.name as string).split(" ");
          if (parts.length) setFirstName(parts[0]);
          if (parts.length > 1) setLastName(parts.slice(1).join(" "));
        }
        if (!firstName && payload.given_name) setFirstName(payload.given_name);
        if (!lastName && payload.family_name) setLastName(payload.family_name);
        if (!username && payload["cognito:username"])
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
  }, [apiBase, router, params]);

  // Apply initial prefill values from query params and AuthProvider profile
  useEffect(() => {
    if (params.email) setEmail(params.email as string);
    if (params.firstName) setFirstName(params.firstName as string);
    if (params.lastName) setLastName(params.lastName as string);

    if (authSub) setSub(authSub);

    if (profile) {
      if (profile.email) setEmail(profile.email);
      if (profile.username) setUsername(profile.username);
      if (profile.firstName) setFirstName(profile.firstName);
      if (profile.lastName) setLastName(profile.lastName);

      const initMissing: ("username" | "email" | "firstName" | "lastName")[] =
        [];
      if (!profile.username) initMissing.push("username");
      if (!profile.email) initMissing.push("email");
      if (!profile.firstName) initMissing.push("firstName");
      if (!profile.lastName) initMissing.push("lastName");
      setInitialMissing(initMissing);
    } else if (!checkingProfile) {
      const initMissing: ("username" | "email" | "firstName" | "lastName")[] =
        [];
      if (!username) initMissing.push("username");
      if (!email) initMissing.push("email");
      if (!firstName) initMissing.push("firstName");
      if (!lastName) initMissing.push("lastName");
      setInitialMissing(initMissing);
    }

    if (checkingProfile) setLoading(true);
    else setLoading(false);
  }, [params, authSub, profile, checkingProfile]);

  // Determine which fields are missing and need user input
  const missingFields = (): (
    | "username"
    | "email"
    | "firstName"
    | "lastName"
  )[] => {
    const missing: ("username" | "email" | "firstName" | "lastName")[] = [];

    // Prefer server/profile values first, then local inputs
    const valUsername = profile?.username ?? username;
    const valEmail = profile?.email ?? email;
    const valFirst = profile?.firstName ?? firstName;
    const valLast = profile?.lastName ?? lastName;

    if (!valUsername) missing.push("username");
    if (!valEmail) missing.push("email");
    if (!valFirst) missing.push("firstName");
    if (!valLast) missing.push("lastName");
    return missing;
  };

  const handleSave = async () => {
    // Merge latest profile with edited values
    const targetSub = sub || authSub;
    if (!targetSub) return;
    const toSave: any = { sub: targetSub };
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

      // After save, refresh AuthProvider's view of the profile
      try {
        await checkProfile();
      } catch (e) {
        console.warn("checkProfile after save failed:", e);
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
  // No automatic redirect: allow the user to review autofilled values and
  // click Save when they are ready.

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 40 }}
    >
      <Text style={styles.title}>Complete Your Profile</Text>
      <Text style={{ marginBottom: 10 }}>
        Please confirm or update your information so we can finish setting up
        your account.
      </Text>

      {/* Always show all fields so users can confirm autofilled values */}
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username ?? ""}
        onChangeText={setUsername as any}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email ?? ""}
        onChangeText={setEmail as any}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="First name"
        value={firstName ?? ""}
        onChangeText={setFirstName as any}
      />

      <TextInput
        style={styles.input}
        placeholder="Last name"
        value={lastName ?? ""}
        onChangeText={setLastName as any}
      />

      {need.length === 0 && (
        <Text style={{ marginBottom: 12, color: "#666", textAlign: "center" }}>
          All fields are filled — please verify and click Save to complete
          setup.
        </Text>
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
