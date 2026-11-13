import * as SecureStore from "expo-secure-store";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { Platform } from "react-native";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import hinglish from "./locales/hinglish.json";

export const supportedLanguages = ["en", "hi", "hinglish"] as const;
export type AppLanguage = (typeof supportedLanguages)[number];

const LANGUAGE_STORAGE_KEY = "babajee.language";
const resources = {
  en: { translation: en },
  hi: { translation: hi },
  hinglish: { translation: hinglish },
};

function getStoredLanguage(): Promise<string | null> {
  if (Platform.OS === "web" && typeof globalThis.localStorage !== "undefined") {
    return Promise.resolve(globalThis.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  }
  if (Platform.OS === "web") return Promise.resolve(null);
  return SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
}

function storeLanguage(language: AppLanguage): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof globalThis.localStorage === "undefined") {
      throw new Error("Browser storage is not available in this environment.");
    }
    globalThis.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, language);
}

function isAppLanguage(value: string | null): value is AppLanguage {
  return value !== null && supportedLanguages.includes(value as AppLanguage);
}

export const i18nReady = (async () => {
  const savedLanguage = await getStoredLanguage();
  const language = isAppLanguage(savedLanguage) ? savedLanguage : "en";

  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: "en",
    supportedLngs: [...supportedLanguages],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
})();

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  await i18nReady;
  await i18n.changeLanguage(language);
  await storeLanguage(language);
}

export default i18n;
