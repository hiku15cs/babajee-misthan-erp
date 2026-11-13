import { AppState, Platform, type AppStateStatus } from "react-native";
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
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      if (typeof globalThis.localStorage === "undefined") return Promise.resolve(null);
      return Promise.resolve(globalThis.localStorage.getItem(key));
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      if (typeof globalThis.localStorage === "undefined") {
        return Promise.reject(new Error("Browser storage is not available."));
      }
      globalThis.localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      if (typeof globalThis.localStorage === "undefined") {
        return Promise.reject(new Error("Browser storage is not available."));
      }
      globalThis.localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
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
  if (Platform.OS === "web") {
    return () => undefined;
  }

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

  if (AppState.currentState === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

  return () => {
    appStateSubscription?.remove();
    appStateSubscription = undefined;
    void supabase.auth.stopAutoRefresh();
  };
}
