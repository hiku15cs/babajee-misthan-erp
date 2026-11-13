import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { OwnerHeader } from "./OwnerHeader";
import { supabase } from "../lib/supabase";

export function OwnerGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        if (active) {
          setStatus("denied");
          router.replace("/");
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (active) setStatus(profile?.role === "OWNER" && profile.is_active ? "allowed" : "denied");
    })().catch((accessError: unknown) => {
      if (!active) return;
      setError(accessError instanceof Error ? accessError.message : String(accessError));
      setStatus("error");
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      {status === "allowed" ? (
        <>
          <OwnerHeader />
          {children}
        </>
      ) : status === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color="#E51A1A" />
          <Text style={styles.message}>Checking owner access…</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.title}>
            {status === "error" ? "Could not verify access" : "Owner access required"}
          </Text>
          <Text style={styles.message}>
            {status === "error" ? error : "This section is available to active owners only."}
          </Text>
          <Pressable onPress={() => router.replace("/(inventory)/procurement")} style={styles.button}>
            <Text style={styles.buttonText}>Back to inventory</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFDF9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { color: "#141212", fontSize: 20, fontWeight: "800", textAlign: "center" },
  message: { color: "#6B625E", fontSize: 14, textAlign: "center" },
  button: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 9, backgroundColor: "#E51A1A" },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
});
