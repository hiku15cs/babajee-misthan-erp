import "../global.css";
import "react-native-url-polyfill/auto";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nextProvider } from "react-i18next";

import i18n, { i18nReady } from "../lib/i18n";
import { connectSupabaseAuthToAppState } from "../lib/supabase";
import { startOfflineSyncManager } from "../lib/offlineSync";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const disconnectAuth = connectSupabaseAuthToAppState();
    const stopOfflineSyncManager = startOfflineSyncManager();

    void i18nReady.then(
      () => {
        if (active) setReady(true);
      },
      (initializationError: unknown) => {
        if (active) {
          setError(
            initializationError instanceof Error
              ? initializationError.message
              : String(initializationError),
          );
        }
      },
    );

    return () => {
      active = false;
      disconnectAuth();
      stopOfflineSyncManager();
    };
  }, []);

  return (
    <SafeAreaProvider>
      {error ? (
        <View className="flex-1 items-center justify-center bg-brand-cream px-6">
          <Text className="text-center text-base text-status-danger">{error}</Text>
        </View>
      ) : ready ? (
        <I18nextProvider i18n={i18n}>
          <Stack screenOptions={{ headerShown: false }} />
        </I18nextProvider>
      ) : (
        <View className="flex-1 items-center justify-center bg-brand-cream">
          <Text className="text-base text-content-light">Loading...</Text>
        </View>
      )}
    </SafeAreaProvider>
  );
}
