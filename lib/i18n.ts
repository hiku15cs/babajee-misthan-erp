import * as SecureStore from "expo-secure-store";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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

function isAppLanguage(value: string | null): value is AppLanguage {
  return value !== null && supportedLanguages.includes(value as AppLanguage);
}

export const i18nReady = (async () => {
  const savedLanguage = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
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
  await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, language);
}

export default i18n;
