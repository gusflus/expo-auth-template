import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pending_signup_v1";

export interface PendingSignup {
  username: string;
  password?: string;
  email?: string;
  createdAt?: number;
}

export async function setPendingSignup(data: PendingSignup) {
  try {
    const payload = { ...data, createdAt: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    console.log("setPendingSignup saved", { key: STORAGE_KEY, payload });
  } catch (err) {
    console.warn("setPendingSignup error", err);
  }
}

export async function getPendingSignup(): Promise<PendingSignup | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSignup;

    // Expire pending signups after 24 hours
    const TTL = 24 * 60 * 60 * 1000;
    if (parsed.createdAt && Date.now() - parsed.createdAt > TTL) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }

    console.log("getPendingSignup loaded", parsed);
    return parsed;
  } catch (err) {
    console.warn("getPendingSignup error", err);
    return null;
  }
}

export async function clearPendingSignup() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log("clearPendingSignup removed", STORAGE_KEY);
  } catch (err) {
    console.warn("clearPendingSignup error", err);
  }
}
