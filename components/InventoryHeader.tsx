import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";

import { supportedLanguages, setAppLanguage, type AppLanguage } from "../lib/i18n";
import { supabase } from "../lib/supabase";

const pages = [
  { path: "/(inventory)/procurement", labelKey: "inventory.procurementTitle" },
  { path: "/(inventory)/fmcg-batches", labelKey: "inventory.stockInTitle" },
  { path: "/(inventory)/expiry-watchlist", labelKey: "inventory.expiryWatchlist" },
] as const;

export function InventoryHeader() {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const [languageError, setLanguageError] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.user) return;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (active) setIsOwner(profile?.role === "OWNER" && profile.is_active);
    }).catch((loadError: unknown) => {
      if (active) {
        setLanguageError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function chooseLanguage(language: AppLanguage) {
    setLanguageError("");
    try {
      await setAppLanguage(language);
    } catch (error) {
      setLanguageError(error instanceof Error ? error.message : String(error));
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLanguageError(error.message);
      return;
    }
    router.replace("/");
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.top}>
        <Text style={styles.brand}>BABA JI MISTHAN BHANDAR</Text>
        <View style={styles.actions}>
          {supportedLanguages.map((language) => (
            <Pressable
              key={language}
              onPress={() => void chooseLanguage(language)}
              style={[
                styles.language,
                i18n.language === language && styles.languageActive,
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  i18n.language === language && styles.languageTextActive,
                ]}
              >
                {language.toUpperCase()}
              </Text>
            </Pressable>
          ))}
          {isOwner ? (
            <Pressable
              onPress={() => router.push("/(admin)/closing")}
              style={styles.owner}
            >
              <Text style={styles.ownerText}>Owner insights</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void signOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>{t("auth.signOut")}</Text>
          </Pressable>
        </View>
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
                <Text
                  style={[styles.navText, active && styles.navTextActive]}
                >
                  {t(page.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {languageError ? <Text style={styles.error}>{languageError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8DED7",
  },
  top: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 12,
  },
  brand: { flexShrink: 1, color: "#E51A1A", fontSize: 16, fontWeight: "800" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  language: {
    minWidth: 38,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FFF3E7",
  },
  languageActive: { backgroundColor: "#E51A1A" },
  languageText: { color: "#6B625E", fontSize: 12, fontWeight: "700" },
  languageTextActive: { color: "#FFFFFF" },
  signOut: { paddingHorizontal: 8, paddingVertical: 10 },
  signOutText: { color: "#6B625E", fontSize: 13, fontWeight: "600" },
  owner: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: "#FFF3CF" },
  ownerText: { color: "#604500", fontSize: 12, fontWeight: "800" },
  nav: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#FFF7EE",
  },
  navButtonActive: { backgroundColor: "#F3A806" },
  navText: { color: "#443B36", fontSize: 13, fontWeight: "600" },
  navTextActive: { color: "#141212", fontWeight: "800" },
  error: { paddingHorizontal: 16, paddingBottom: 10, color: "#C62828" },
});
