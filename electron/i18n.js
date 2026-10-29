import { createTranslator, normalizeLanguage } from "../locales/runtime.js";
export const i18n = createTranslator();
export const t = (key, options = {}) =>
  i18n.exists(key) ? i18n.t(key, options) : key;
export const setLanguage = (language) =>
  i18n.changeLanguage(normalizeLanguage(language));
