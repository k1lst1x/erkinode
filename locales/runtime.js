import { createInstance } from "i18next";
import en from "./en.json" with { type: "json" };
import ru from "./ru.json" with { type: "json" };
import kk from "./kk.json" with { type: "json" };

export const catalogs = { en, ru, kk };
export const languages = Object.entries(catalogs).map(([code, messages]) => ({
  code,
  name: messages["language.nativeName"],
}));
export const languageCodes = languages.map((language) => language.code);
export const normalizeLanguage = (value) =>
  languages.some(({ code }) => code === value) ? value : "en";

export function createTranslator(plugin) {
  const instance = createInstance();
  if (plugin) instance.use(plugin);
  instance.init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: languages.map(({ code }) => code),
    resources: {
      en: { translation: structuredClone(en) },
      ru: { translation: structuredClone(ru) },
      kk: { translation: structuredClone(kk) },
    },
    initAsync: false,
    keySeparator: false,
    nsSeparator: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });
  return instance;
}
