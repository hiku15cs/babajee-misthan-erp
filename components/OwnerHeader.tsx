import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useState } from "react";

import { supabase } from "../lib/supabase";

const pages = [
  { path: "/(admin)/closing", label: "Daily closing" },
  { path: "/(admin)/analytics", label: "P&L analytics" },
  { path: "/(admin)/audit", label: "Audit trail" },
  { path: "/(admin)/users", label: "User management" },
] as const;

export function OwnerHeader() {
  const pathname = usePathname();
  const [error, setError] = useState("");

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    router.replace("/");
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.top}>
        <Text style={styles.brand}>BABA JI MISTHAN BHANDAR</Text>
        <Pressable onPress={() => router.push("/(inventory)/procurement")} style={styles.inventory}>
          <Text style={styles.inventoryText}>Inventory</Text>
        </Pressable>
        <Pressable onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.nav}>
          {pages.map((page) => {
            const active = pathname.endsWith(page.path.split("/").pop() ?? "");
            return (
              <Pressable
                key={page.path}
                onPress={() => router.push(page.path)}
                style={[styles.navButton, active && styles.navButtonActive]}
              >
                <Text style={[styles.navText, active && styles.navTextActive]}>{page.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E8DED7" },
  top: { minHeight: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12 },
  brand: { flex: 1, color: "#E51A1A", fontSize: 15, fontWeight: "800" },
  inventory: { paddingHorizontal: 10, paddingVertical: 9 },
  inventoryText: { color: "#6B625E", fontSize: 13, fontWeight: "600" },
  signOut: { paddingHorizontal: 8, paddingVertical: 9 },
  signOutText: { color: "#6B625E", fontSize: 13, fontWeight: "600" },
  nav: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 9, gap: 8 },
  navButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9, backgroundColor: "#FFF7EE" },
  navButtonActive: { backgroundColor: "#F3A806" },
  navText: { color: "#443B36", fontSize: 13, fontWeight: "600" },
  navTextActive: { color: "#141212", fontWeight: "800" },
  error: { paddingHorizontal: 16, paddingBottom: 8, color: "#C62828" },
});
