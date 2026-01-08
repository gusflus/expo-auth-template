import { confirmSignUp, signIn } from "aws-amplify/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const username = (params.username as string) ?? "";
  const password = (params.password as string) ?? "";
  const emailParam = (params.email as string) ?? "";

  const [confirmationCode, setConfirmationCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If there's no username param, send back to login
    if (!username) {
      router.replace("/login");
    }
  }, [username, router]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await confirmSignUp({ username, confirmationCode });

      // Attempt to sign in automatically using the provided password if available
      if (password) {
        try {
          await signIn({ username, password });
          router.replace("/logged-in");
          return;
        } catch (err: any) {
          console.warn("Auto sign-in failed after confirmation:", err);
          // If sign in fails, show message and redirect to login
          Alert.alert(
            "Confirmed",
            "Account confirmed successfully. Please sign in."
          );
          router.replace("/login");
          return;
        }
      } else {
        Alert.alert(
          "Confirmed",
          "Account confirmed successfully. Please sign in."
        );
        router.replace("/login");
        return;
      }
    } catch (err: any) {
      console.warn(err);
      Alert.alert("Confirmation Error", err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 40 }}
    >
      <Text style={styles.title}>Confirm Your Account</Text>
      <Text style={{ marginBottom: 8 }}>{emailParam ?? username}</Text>

      <TextInput
        style={styles.input}
        placeholder="Confirmation Code"
        value={confirmationCode}
        onChangeText={setConfirmationCode}
        keyboardType="numeric"
      />
      <TouchableOpacity
        style={[styles.button, loading ? { opacity: 0.6 } : {}]}
        onPress={handleConfirm}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Processing..." : "Confirm and Sign In"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace("/login")}>
        <Text style={styles.linkText}>Back to Sign In</Text>
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
