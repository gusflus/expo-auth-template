import { confirmSignUp, resendSignUpCode, signIn } from "aws-amplify/auth";
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
import {
  clearPendingSignup,
  getPendingSignup,
  setPendingSignup,
} from "../lib/pendingSignup";

export default function ConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const username = (params.username as string) ?? "";
  const password = (params.password as string) ?? "";
  const emailParam = (params.email as string) ?? "";

  const [confirmationCode, setConfirmationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);

  const handleResend = async () => {
    try {
      setResendLoading(true);
      setResendDisabled(true);
      // Ensure we have a username to resend for (either from params or persisted pending signup)
      let target = username;
      if (!target) {
        try {
          const stored = await getPendingSignup();
          target = stored?.username ?? "";
        } catch (err) {
          console.warn("Failed to read pending signup during resend", err);
        }
      }

      if (!target) {
        Alert.alert("Error", "No username available to resend code for.");
        setResendLoading(false);
        setResendDisabled(false);
        return;
      }

      await resendSignUpCode({ username: target });

      try {
        await setPendingSignup({
          username: target,
          password,
          email: emailParam ?? target,
        });
      } catch (err) {
        console.warn("Failed to persist pending signup on resend", err);
      }

      Alert.alert(
        "Code Sent",
        "A new confirmation code has been sent to your email."
      );

      // Cooldown the button for 30s
      setTimeout(() => setResendDisabled(false), 30 * 1000);
    } catch (err: any) {
      console.warn("Resend code failed", err);
      Alert.alert("Resend Error", err?.message ?? String(err));
      setResendDisabled(false);
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    // If there's no username param, try to restore from persisted pending signup; otherwise send back to login
    (async () => {
      if (username) return;
      try {
        const pending = await getPendingSignup();
        if (pending?.username) {
          // Restore confirmation flow using stored values
          router.replace(
            `/confirm?username=${encodeURIComponent(
              pending.username
            )}&password=${encodeURIComponent(
              pending.password ?? ""
            )}&email=${encodeURIComponent(pending.email ?? "")}`
          );
          return;
        }
      } catch (err) {
        console.warn("Failed to read pending signup", err);
      }

      router.replace("/login");
    })();
  }, [username, router]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await confirmSignUp({ username, confirmationCode });

      // Attempt to sign in automatically using the provided password if available
      if (password) {
        try {
          await signIn({ username, password });
          // Clear persisted pending signup now that the account is confirmed
          try {
            await clearPendingSignup();
          } catch (err) {
            console.warn(
              "Failed to clear pending signup after auto sign-in",
              err
            );
          }

          // After sign-in, prompt user to complete any missing profile fields
          router.replace("/complete-profile");
          return;
        } catch (err: any) {
          console.warn("Auto sign-in failed after confirmation:", err);
          // If sign in fails, show message and redirect to login
          try {
            await clearPendingSignup();
          } catch (err) {
            console.warn(
              "Failed to clear pending signup after confirmation",
              err
            );
          }

          Alert.alert(
            "Confirmed",
            "Account confirmed successfully. Please sign in."
          );
          router.replace("/login");
          return;
        }
      } else {
        try {
          await clearPendingSignup();
        } catch (err) {
          console.warn(
            "Failed to clear pending signup after confirmation",
            err
          );
        }

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

      <TouchableOpacity
        style={[styles.button, resendDisabled ? { opacity: 0.6 } : {}]}
        onPress={handleResend}
        disabled={resendLoading || resendDisabled}
      >
        <Text style={styles.buttonText}>
          {resendLoading ? "Sending..." : "Resend Code"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={async () => {
          try {
            await clearPendingSignup();
          } catch (err) {
            console.warn("Failed to clear pending signup on cancel", err);
          }
          router.replace("/login");
        }}
      >
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
