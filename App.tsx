import "./global.css";
import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { I18nextProvider, useTranslation } from "react-i18next";

import i18n, { i18nReady } from "./lib/i18n";
import { connectSupabaseAuthToAppState } from "./lib/supabase";

export default function App() {
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
      <SafeAreaView className="flex-1 items-center justify-center bg-brand-cream px-6">
        <Text className="text-center text-base text-status-danger">
          {initializationError}
        </Text>
      </SafeAreaView>
    );
  }

  if (!i18nInitialized) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-brand-cream">
        <Text className="text-base text-content-light">Loading...</Text>
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
    <SafeAreaView className="flex-1 bg-brand-cream dark:bg-surface-dark dark-media:bg-surface-dark">
      <StatusBar style="auto" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-2xl font-bold text-brand-crimson">
          {t("common.appName")}
        </Text>
        <Text className="mt-2 text-center text-base text-content-light dark:text-content-dark dark-media:text-content-dark">
          {t("pos.title")}
        </Text>
      </View>
    </SafeAreaView>
  );
}
