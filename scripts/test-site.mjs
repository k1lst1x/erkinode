import { _electron as electron } from "playwright";
import { serveSite } from "./serve-site.mjs";
import { expectedReleaseFiles } from "./prepare-release.mjs";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const server = await serveSite({ port: 0, prefix: "/project-name/" });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await electron.launch({
  args: ["scripts/site-browser.cjs"],
  env,
});
try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { repository } = JSON.parse(
    await fs.readFile(
      new URL("../_site/assets/config.json", import.meta.url),
      "utf8",
    ),
  );
  if (!repository)
    throw new Error(
      "Build the test site with SITE_REPOSITORY=OWNER/REPO first",
    );
  const release = {
    tag_name: "v1.2.0-beta.1",
    prerelease: true,
    assets: [
      ...expectedReleaseFiles("1.2.0-beta.1").map((name, index) => ({
        name,
        state: "uploaded",
        size: 104857600,
        digest: `sha256:${String(index + 1).padStart(64, "0")}`,
        browser_download_url: `https://github.com/${repository}/releases/download/v1.2.0-beta.1/${name}`,
      })),
      {
        name: "SHA256SUMS.txt",
        state: "uploaded",
        size: 1024,
        digest: `sha256:${"f".repeat(64)}`,
        browser_download_url: `https://github.com/${repository}/releases/download/v1.2.0-beta.1/SHA256SUMS.txt`,
      },
    ],
  };
  let response = [release],
    apiFailure = false;
  await page.route("https://api.github.com/**", async (route) =>
    apiFailure
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: "{}",
        })
      : route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(response),
        }),
  );
  let client = {
    userAgent: "Windows NT 10.0; Win64; x64",
    platform: "Win32",
    maxTouchPoints: 0,
  };
  await page.addInitScript(() => {
    const data = JSON.parse(localStorage.getItem("test-client") || "null");
    if (!data) return;
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: undefined,
    });
    for (const [key, value] of Object.entries(data))
      Object.defineProperty(navigator, key, { configurable: true, value });
  });
  await page.goto(server.url);
  await page.evaluate(
    (data) => localStorage.setItem("test-client", JSON.stringify(data)),
    client,
  );
  await page.reload();
  await page
    .getByRole("link", { name: "Download for Windows · x64", exact: true })
    .waitFor();
  assert.match(
    await page.locator("#primary-download").getAttribute("href"),
    /Windows-x64-Setup\.exe$/,
  );
  assert.match(
    await page.locator("#release-status").innerText(),
    /Beta release/,
  );
  assert.equal(
    await page.locator('[data-os-card="win"]').getAttribute("aria-label"),
    "Windows — your detected operating system",
  );
  assert.equal(await page.locator(".download-card.is-current").count(), 1);
  await page.getByText("See SHA-256 hashes", { exact: true }).click();
  assert.equal(await page.locator("#checksum-values .checksum-row").count(), 7);
  await page.getByRole("link", { name: /Portable version/ }).waitFor();
  assert.match(
    await page.locator("#checksums").getAttribute("href"),
    /SHA256SUMS\.txt$/,
  );
  assert.match(
    await page.locator("#primary-os-icon").getAttribute("src"),
    /os-windows\.svg$/,
  );
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/site-desktop.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    localStorage.setItem(
      "test-client",
      JSON.stringify({
        userAgent: "Macintosh; Intel Mac OS X",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ),
  );
  await page.reload();
  await page
    .getByRole("link", { name: "Download for macOS", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Download for macOS", exact: true })
    .click();
  assert.equal(await page.locator("#download-menu").isVisible(), true);
  assert.equal(
    await page.locator('[data-picker-download="win-x64"]').isVisible(),
    false,
  );
  assert.equal(
    await page
      .locator('[data-picker-download="mac-arm64"]')
      .getAttribute("href"),
    release.assets.find((asset) => asset.name.endsWith("macOS-arm64.dmg"))
      .browser_download_url,
  );
  assert.equal(
    await page.locator("#primary-download").getAttribute("href"),
    "#downloads",
  );
  assert.equal(
    await page
      .locator('[data-download="mac-arm64"][data-format="zip"]')
      .getAttribute("href"),
    release.assets.find((asset) => asset.name.endsWith("macOS-arm64.zip"))
      .browser_download_url,
  );
  // Missing release assets have no fake direct download links.
  response = [
    {
      ...release,
      assets: release.assets.filter((asset) => !asset.name.includes("Windows")),
    },
  ];
  await page.reload();
  await page
    .getByText("Not available in this release", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page
      .locator('[data-download="win-x64"]')
      .first()
      .getAttribute("href"),
    null,
  );
  response = [];
  await page.reload();
  await page
    .getByText(/The first desktop release has not been published/)
    .waitFor();
  apiFailure = true;
  await page.reload();
  await page
    .getByText(/Release information is temporarily unavailable/)
    .waitFor();
  assert.equal(
    await page.locator('[data-download="linux-x64"]').getAttribute("href"),
    `https://github.com/${repository}/releases`,
  );
  apiFailure = false;
  response = [release];
  await page.evaluate(() =>
    localStorage.setItem(
      "test-client",
      JSON.stringify({
        userAgent: "iPhone",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText(/Desktop app for macOS, Windows, and Linux/).waitFor();
  await page
    .getByRole("link", { name: "Choose desktop download", exact: true })
    .click();
  assert.equal(
    await page.locator("#download-menu [role=menuitem]:visible").count(),
    4,
  );
  await page.getByText("See SHA-256 hashes", { exact: true }).click();
  assert.equal(
    await page
      .locator(".checksum-row")
      .first()
      .evaluate((row) => {
        const code = row.querySelector("code");
        return (
          row.scrollWidth <= row.clientWidth &&
          code.scrollWidth <= code.clientWidth
        );
      }),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/site-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Read the docs", exact: false }).click();
  await page
    .getByRole("heading", { name: "Documentation", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /Documentation Overview/ }).click();
  await page
    .getByRole("link", { name: "Installation", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Installation", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Copy for AI agents", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".docs-sidebar.is-collapsible").waitFor();
  const docsMenu = page.locator("#docs-menu-content");
  assert.equal(await docsMenu.isVisible(), false);
  await page.screenshot({
    path: "test-results/site-documentation-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Documentation Installation/ })
    .click();
  assert.equal(await docsMenu.isVisible(), true);
  assert.equal(
    await page
      .getByRole("button", { name: /Documentation Installation/ })
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(
    await page.evaluate(async () => {
      const button = document.querySelector("[data-copy-doc]");
      const response = await fetch(button.dataset.copyDoc);
      return (
        response.ok && (await response.text()).startsWith("# Installation")
      );
    }),
    true,
  );
  assert.ok(page.url().includes("/project-name/docs/installation/"));
  await page.getByLabel("Find a guide").fill("SSH");
  assert.equal(await page.locator(".docs-nav a:visible").count(), 1);
  await page.getByLabel("Find a guide").fill("");
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.screenshot({
    path: "test-results/site-documentation.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "WEBSITE UI PASS: OS recommendation, Safari architecture choice, beta assets, absent assets/releases, API fallback, mobile layout, nested project paths, documentation and topic filter.",
  );
} finally {
  await desktop.close();
  await server.close();
}
