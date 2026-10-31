import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  detectPlatform,
  releaseDownloads,
  selectRelease,
} from "../site/downloads.mjs";
import { releaseMetadata } from "../scripts/release-meta.mjs";
import {
  expectedReleaseFiles,
  prepareRelease,
} from "../scripts/prepare-release.mjs";
test("download detection distinguishes desktop OS without guessing Safari Mac architecture", () => {
  assert.deepEqual(
    detectPlatform({
      userAgent: "Mozilla Macintosh; Intel Mac OS X 10_15_7",
      platform: "MacIntel",
    }),
    { os: "mac", arch: "unknown" },
  );
  assert.deepEqual(
    detectPlatform({ platform: "macOS", architecture: "arm", bitness: "64" }),
    { os: "mac", arch: "arm64" },
  );
  assert.deepEqual(
    detectPlatform({ userAgent: "Windows NT 10.0; Win64; x64" }),
    { os: "win", arch: "x64" },
  );
  assert.deepEqual(detectPlatform({ userAgent: "X11; Linux aarch64" }), {
    os: "linux",
    arch: "arm64",
  });
  for (const value of [
    { platform: "MacIntel", maxTouchPoints: 5 },
    { userAgent: "Android Linux" },
    { userAgent: "CrOS x86_64" },
  ])
    assert.equal(detectPlatform(value).os, "mobile");
  assert.equal(detectPlatform().os, "unknown");
});
test("downloads support prereleases, prefer stable, and never invent missing or foreign asset links", () => {
  const beta = { tag_name: "v1.2.0-beta.1", prerelease: true, assets: [] };
  const stable = { tag_name: "v1.1.0", prerelease: false, assets: [] };
  assert.equal(selectRelease([beta]), beta);
  assert.equal(selectRelease([beta, stable]), stable);
  assert.equal(selectRelease([{ ...beta, draft: true }]), null);
  const asset = {
    name: "Erkinode-1.2.0-beta.1-macOS-arm64.dmg",
    size: 5,
    state: "uploaded",
    browser_download_url:
      "https://github.com/example/erkinode/releases/download/v1.2.0-beta.1/app.dmg",
  };
  beta.assets = [asset];
  const downloads = releaseDownloads(beta, "example/erkinode");
  assert.equal(downloads["mac-arm64"].asset, asset);
  assert.equal(downloads["win-x64"].asset, null);
  assert.equal(downloads["mac-arm64"].zip, null);
  beta.assets = [
    { ...asset, browser_download_url: "https://evil.example/app.dmg" },
  ];
  assert.equal(
    releaseDownloads(beta, "example/erkinode")["mac-arm64"].asset,
    null,
  );
});
test("release metadata rejects mismatched tags and complete artifact sets get checksums", async () => {
  assert.equal(releaseMetadata("1.2.0-beta.1").prerelease, true);
  assert.equal(releaseMetadata("1.0.0").prerelease, false);
  assert.throws(
    () => releaseMetadata("1.2.0-beta.1", "tag", "v1.1.0"),
    /does not match/,
  );
  assert.throws(() => expectedReleaseFiles("../bad"), /Invalid/);
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "erkinode-release-"),
  );
  try {
    const names = expectedReleaseFiles("1.2.0-beta.1");
    assert.equal(names.length, 7);
    assert(names.some((name) => name.endsWith("Windows-x64-Portable.exe")));
    await assert.rejects(prepareRelease(directory, "1.2.0-beta.1"));
    for (const name of names)
      await fs.writeFile(path.join(directory, name), name);
    await prepareRelease(directory, "1.2.0-beta.1");
    const sums = await fs.readFile(
      path.join(directory, "SHA256SUMS.txt"),
      "utf8",
    );
    assert.equal(sums.trim().split("\n").length, 7);
    assert.match(sums, /^[a-f0-9]{64}  Erkinode-/);
    await fs.writeFile(path.join(directory, "unexpected.exe"), "unexpected");
    await assert.rejects(
      prepareRelease(directory, "1.2.0-beta.1"),
      /Unexpected/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
