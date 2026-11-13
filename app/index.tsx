import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      else if (data.session) router.replace("/(inventory)/procurement");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function signIn() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/(inventory)/procurement");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.brand}>BABA JI MISTHAN BHANDAR</Text>
        <Text style={styles.subtitle}>Inventory sign in</Text>
        {loading ? (
          <ActivityIndicator color="#E51A1A" />
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoComplete="current-password"
              onSubmitEditing={() => void signIn()}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void signIn()}
              style={styles.button}
            >
              <Text style={styles.buttonText}>
                {submitting ? "Signing in..." : "Sign in"}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              Use an owner or manager account. Staff accounts cannot manage inventory.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFFDF9",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    gap: 14,
    padding: 24,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    elevation: 3,
  },
  brand: {
    color: "#E51A1A",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    marginBottom: 8,
    color: "#6B625E",
    fontSize: 16,
    textAlign: "center",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#E8DED7",
    borderRadius: 10,
    paddingHorizontal: 14,
    color: "#141212",
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#E51A1A",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  error: { color: "#C62828", fontSize: 14 },
  hint: { color: "#6B625E", fontSize: 13, textAlign: "center" },
});
