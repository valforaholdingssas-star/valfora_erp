import { es } from "./es.js";

const dictionaries = { es };

/**
 * @param {string} locale
 * @returns {(key: string) => string}
 */
export function createTranslator(locale = "es") {
  const dict = dictionaries[locale] || es;
  return (key) => {
    const parts = key.split(".");
    let cur = dict;
    for (const p of parts) {
      cur = cur?.[p];
    }
    return typeof cur === "string" ? cur : key;
  };
}
