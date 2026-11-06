import { AppState, type AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Configure babajee-erp/.env before starting the app.",
  );
}

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;

export function connectSupabaseAuthToAppState(): () => void {
  if (appStateSubscription) {
    return () => undefined;
  }

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  };

  handleAppStateChange(AppState.currentState);
  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

  return () => {
    appStateSubscription?.remove();
    appStateSubscription = undefined;
    void supabase.auth.stopAutoRefresh();
  };
}
