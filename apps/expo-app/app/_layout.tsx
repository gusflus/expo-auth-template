import AuthProvider from "auth";
import { Stack } from "expo-router";
import "react-native-url-polyfill/auto";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
