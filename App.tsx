import "./global.css";
import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { I18nextProvider, useTranslation } from "react-i18next";

import i18n, { i18nReady } from "./lib/i18n";
import { connectSupabaseAuthToAppState } from "./lib/supabase";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [i18nInitialized, setI18nInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string>();

  useEffect(() => {
    const disconnectAuth = connectSupabaseAuthToAppState();
    let active = true;

    void i18nReady.then(
      () => {
        if (active) setI18nInitialized(true);
      },
      (error: unknown) => {
        if (active) {
          setInitializationError(
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    );

    return () => {
      active = false;
      disconnectAuth();
    };
  }, []);

  if (initializationError) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.error}>
          {initializationError}
        </Text>
      </SafeAreaView>
    );
  }

  if (!i18nInitialized) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.subtitle}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <HomeScreen />
    </I18nextProvider>
  );
}

function HomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView
      style={styles.screen}
      className="dark:bg-surface-dark dark-media:bg-surface-dark"
    >
      <StatusBar style="auto" />
      <View style={styles.content}>
        <Text style={styles.title} className="font-bold">
          {t("common.appName")}
        </Text>
        <Text style={styles.subtitle}>
          {t("pos.title")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFDF9",
    paddingHorizontal: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#E51A1A",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    color: "#141212",
    fontSize: 16,
    textAlign: "center",
  },
  error: {
    color: "#C62828",
    fontSize: 16,
    textAlign: "center",
  },
});
