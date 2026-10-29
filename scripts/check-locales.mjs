import assert from "node:assert/strict";
import en from "../locales/en.json" with { type: "json" };
import { catalogs } from "../locales/runtime.js";

export function checkCatalogs() {
  const placeholders = (value) =>
    [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) => match[1]).sort();
  for (const [name, catalog] of Object.entries(catalogs).filter(
    ([name]) => name !== "en",
  )) {
    assert.deepEqual(
      Object.keys(catalog).sort(),
      Object.keys(en).sort(),
      `${name}: catalog keys differ`,
    );
    for (const [key, text] of Object.entries(catalog)) {
      assert.equal(typeof text, "string", `${name}: ${key} must be a string`);
      assert.ok(text.trim(), `${name}: ${key} is empty`);
      assert.deepEqual(
        placeholders(text),
        placeholders(en[key]),
        `${name}: ${key} placeholders differ`,
      );
    }
  }
  return Object.keys(en).length;
}
console.log(
  `Locale catalogs verified: ${checkCatalogs()} messages across ${Object.keys(catalogs).length} languages.`,
);
