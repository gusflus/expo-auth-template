import React from "react";
import { Button, StyleSheet, View } from "react-native";

import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react-native";
import { Amplify } from "aws-amplify";

import outputs from "@/backend/amplify_outputs.json";
import { SafeAreaView } from "react-native-safe-area-context";
import TodoList from "./TodoList";

Amplify.configure(outputs);

const SignOutButton = () => {
  const { signOut } = useAuthenticator();

  return (
    <View style={styles.signOutButton}>
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
};

const App = () => {
  return (
    <Authenticator.Provider>
      <Authenticator>
        <SafeAreaView style={styles.container}>
          <SignOutButton />
          <TodoList />
        </SafeAreaView>
      </Authenticator>
    </Authenticator.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
  signOutButton: {
    alignSelf: "flex-end",
  },
});

export default App;
