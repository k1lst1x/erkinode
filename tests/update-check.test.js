import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkForUpdate,
  compareVersions,
  isReleaseUrl,
  selectUpdate,
} from "../electron/update-check.js";

test("compares stable and prerelease versions", () => {
  assert.equal(compareVersions("1.3.0", "1.2.0-beta.1"), 1);
  assert.equal(compareVersions("1.2.0-beta.2", "1.2.0-beta.1"), 1);
  assert.equal(compareVersions("1.2.0-beta.1", "1.2.0"), -1);
  assert.equal(compareVersions("invalid", "1.2.0"), null);
});

test("selects the newest eligible GitHub release", () => {
  const releases = [
    {
      tag_name: "v1.3.0",
      html_url: "https://github.com/k1lst1x/erkinode/releases/tag/v1.3.0",
      draft: false,
      prerelease: false,
    },
    {
      tag_name: "v1.4.0-beta.1",
      html_url:
        "https://github.com/k1lst1x/erkinode/releases/tag/v1.4.0-beta.1",
      draft: false,
      prerelease: true,
    },
  ];
  assert.equal(selectUpdate("1.2.0-beta.1", releases)?.version, "1.4.0-beta.1");
  assert.equal(selectUpdate("1.2.0", releases)?.version, "1.3.0");
});

test("checks releases and only accepts official release URLs", async () => {
  const update = await checkForUpdate("1.2.0", async () => ({
    ok: true,
    json: async () => [
      {
        tag_name: "v1.3.0",
        html_url: "https://github.com/k1lst1x/erkinode/releases/tag/v1.3.0",
        draft: false,
        prerelease: false,
      },
    ],
  }));
  assert.equal(update.available, true);
  assert.equal(update.latestVersion, "1.3.0");
  assert.equal(isReleaseUrl(update.url), true);
  assert.equal(isReleaseUrl("https://example.com/update.exe"), false);
  assert.equal(
    isReleaseUrl(
      "https://github.com.evil.example/k1lst1x/erkinode/releases/tag/v9.9.9",
    ),
    false,
  );
});
