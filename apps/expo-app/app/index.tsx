import { signInWithRedirect, signOut, getCurrentUser, fetchAuthSession, signUp, confirmSignUp, signIn } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert } from "react-native";

type AuthMode = 'signin' | 'signup' | 'confirm';

export default function HomeScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');

  useEffect(() => {
    checkAuthState();
    
    // Listen for auth events
    const hubListener = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
          checkAuthState();
          break;
        case 'signInWithRedirect_failure':
          console.error('Sign in failed:', payload.data);
          setLoading(false);
          break;
        case 'signedOut':
          setUser(null);
          setLoading(false);
          break;
      }
    });

    return () => hubListener();
  }, []);

  const checkAuthState = async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      let userInfo = {
        userId: currentUser.userId,
        username: currentUser.username,
        attributes: {}
      };

      // Get user info from ID token for OAuth users
      if (session.tokens?.idToken) {
        const payload = session.tokens.idToken.payload;
        userInfo.attributes = {
          email: payload.email,
          name: payload.name,
          given_name: payload.given_name,
          family_name: payload.family_name,
        };
      }

      setUser(userInfo);
    } catch (error) {
      console.log("Not authenticated:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithRedirect({ provider: "Google" });
    } catch (error) {
      console.error("Sign in error:", error);
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithRedirect({ provider: "Apple" });
    } catch (error) {
      console.error("Sign in error:", error);
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    try {
      setLoading(true);
      await signIn({ username: email, password });
      await checkAuthState();
    } catch (error: any) {
      Alert.alert("Sign In Error", error.message);
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    try {
      setLoading(true);
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });
      setAuthMode('confirm');
      setLoading(false);
      Alert.alert("Success", "Please check your email for the confirmation code");
    } catch (error: any) {
      Alert.alert("Sign Up Error", error.message);
      setLoading(false);
    }
  };

  const handleConfirmSignUp = async () => {
    try {
      setLoading(true);
      await confirmSignUp({
        username: email,
        confirmationCode,
      });
      Alert.alert("Success", "Account confirmed! You can now sign in.");
      setAuthMode('signin');
      setConfirmationCode('');
    } catch (error: any) {
      Alert.alert("Confirmation Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Expo Auth Demo</Text>
        
        {/* Google Sign In */}
        <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn}>
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </TouchableOpacity>

        {/* Apple Sign In */}
        <TouchableOpacity style={styles.appleButton} onPress={handleAppleSignIn}>
          <Text style={styles.buttonText}>Sign in with Apple</Text>
        </TouchableOpacity>

        <Text style={styles.divider}>OR</Text>

        {/* Email Auth Form */}
        {authMode === 'confirm' ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Confirm Your Account</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirmation Code"
              value={confirmationCode}
              onChangeText={setConfirmationCode}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.button} onPress={handleConfirmSignUp}>
              <Text style={styles.buttonText}>Confirm Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAuthMode('signin')}>
              <Text style={styles.linkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
            </Text>
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
              onPress={authMode === 'signin' ? handleEmailSignIn : handleEmailSignUp}
            >
              <Text style={styles.buttonText}>
                {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
            >
              <Text style={styles.linkText}>
                {authMode === 'signin' 
                  ? "Don't have an account? Sign Up" 
                  : "Already have an account? Sign In"
                }
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

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
        <Text>User ID: {user.userId}</Text>
        <Text>Email: {user.attributes.email}</Text>
        {user.attributes.name && <Text>Name: {user.attributes.name}</Text>}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  form: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#007bff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  googleButton: {
    backgroundColor: "#4285f4",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  appleButton: {
    backgroundColor: "#000",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },
  signOutButton: {
    backgroundColor: "#dc3545",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  linkText: {
    color: "#007bff",
    textAlign: "center",
    fontSize: 14,
    marginTop: 10,
  },
  divider: {
    textAlign: "center",
    fontSize: 16,
    color: "#666",
    marginVertical: 20,
  },
  userInfo: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
});
