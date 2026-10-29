import { initReactI18next } from "react-i18next";
import { createTranslator, languages } from "../../locales/runtime.js";
import en from "../../locales/en.json";

export type MessageId = keyof typeof en;
export const i18n = createTranslator(initReactI18next);
export { languages };
export function t(id: string, options: Record<string, unknown> = {}): string {
  return String(i18n.t(id, options));
}
export const primaryModifier = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
