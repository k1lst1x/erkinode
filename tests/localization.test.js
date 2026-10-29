import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator, normalizeLanguage } from "../locales/runtime.js";
import en from "../locales/en.json" with { type: "json" };
import ru from "../locales/ru.json" with { type: "json" };
import { checkCatalogs } from "../scripts/check-locales.mjs";

test("locale catalogs are complete and preserve named interpolation", () => {
  checkCatalogs();
});

test("language selection, English fallback, interpolation and Russian plurals", async () => {
  const i18n = createTranslator();
  assert.equal(i18n.t("Settings"), en.Settings);
  assert.equal(normalizeLanguage("unknown"), "en");
  await i18n.changeLanguage("ru");
  assert.equal(i18n.t("Settings"), ru.Settings);
  const name = "server.<&>日本語";
  assert.equal(
    i18n.t("Close {{name}}", { name }),
    ru["Close {{name}}"].replace("{{name}}", name),
  );
  for (const [count, suffix] of [
    [1, "one"],
    [2, "few"],
    [5, "many"],
    [21, "one"],
    [22, "few"],
    [0, "many"],
  ]) {
    assert.equal(
      i18n.t("connectionsCount", { count }),
      ru[`connectionsCount_${suffix}`].replace("{{count}}", String(count)),
    );
  }
  i18n.addResource("en", "translation", "test.fallback", "English fallback");
  assert.equal(i18n.t("test.fallback"), "English fallback");
  await i18n.changeLanguage("en");
  assert.equal(i18n.t("connectionsCount", { count: 1 }), "1 connection");
});

test("Kazakh supports language selection, interpolation and count forms", async () => {
  const { default: kk } = await import("../locales/kk.json", {
    with: { type: "json" },
  });
  const i18n = createTranslator();
  assert.equal(normalizeLanguage("kk"), "kk");
  await i18n.changeLanguage("kk");
  assert.equal(i18n.resolvedLanguage, "kk");
  assert.equal(i18n.t("Settings"), kk.Settings);
  assert.equal(i18n.t("Jump host"), kk["Jump host"]);
  assert.equal(
    i18n.t("Password for {{username}}@{{address}}", {
      username: "ubuntu",
      address: "example.com",
    }),
    kk["Password for {{username}}@{{address}}"]
      .replace("{{username}}", "ubuntu")
      .replace("{{address}}", "example.com"),
  );
  for (const count of [0, 1, 2, 5, 21, 100])
    assert.equal(
      i18n.t("connectionsCount", { count }),
      kk.connectionsCount.replace("{{count}}", String(count)),
    );
});
