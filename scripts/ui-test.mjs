import kk from "../locales/kk.json" with { type: "json" };
import ru from "../locales/ru.json" with { type: "json" };
import { _electron as electron } from "playwright";
import { fixture } from "../tests/fixture.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-ui-"));
const server = await fixture();
await fs.mkdir(path.join(server.root, "etc"));
await fs.writeFile(
  path.join(server.root, "etc", "os-release"),
  'ID=ubuntu\nPRETTY_NAME="Ubuntu 24.04 LTS"\nVERSION_ID="24.04"\nID_LIKE=debian\n',
);
await fs.writeFile(
  path.join(directory, "local-upload.txt"),
  "Local to SFTP: Unicode transfer: 日本語\n",
);
let desktop;
try {
  const env = {
    ...process.env,
    ERKINODE_TEST_MODE: "1",
    ERKINODE_TEST_DATA: directory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = await electron.launch({
    args: ["."],
    env,
    timeout: 60000,
  });
  await desktop.evaluate(async ({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  const page = await desktop.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Add host", exact: true }).waitFor();
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/01-empty.png" });
  await page.getByRole("button", { name: "Add host", exact: true }).click();
  assert.ok(
    await page
      .getByLabel("Jump host", { exact: true })
      .evaluate((element) =>
        element
          .closest(".jump-field")
          .querySelector("label")
          .textContent.startsWith("Jump host (optional)"),
      ),
  );
  const jumpHelp = page.getByRole("button", {
    name: "About jump hosts",
    exact: true,
  });
  assert.equal(await page.getByRole("tooltip").count(), 0);
  await page.bringToFront();
  await jumpHelp.hover();
  await page.screenshot({ path: "test-results/jump-tooltip.png" });
  await page.getByRole("tooltip").waitFor();
  await page.getByLabel("Name", { exact: true }).hover();
  await page.getByRole("tooltip").waitFor({ state: "detached" });
  await jumpHelp.focus();
  await page.getByRole("tooltip").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("tooltip").count(), 0);
  const portInput = page.getByLabel("Port", { exact: true });
  assert.equal(await portInput.getAttribute("type"), "text");
  assert.equal(await portInput.getAttribute("inputmode"), "numeric");
  assert.equal(await portInput.getAttribute("placeholder"), "22");
  assert.equal(await portInput.inputValue(), "");
  await portInput.fill("022");
  await portInput.blur();
  assert.equal(await portInput.inputValue(), "22");
  await portInput.fill("");
  assert.equal(await portInput.inputValue(), "");
  await page.getByLabel("Name", { exact: true }).fill("Erkinode integration");
  const addressInput = page.getByLabel("Host address", { exact: true });
  await addressInput.fill("127.0.0.1вй");
  await page.getByRole("button", { name: "Save host" }).click();
  await page
    .getByText("Enter a valid IP address or hostname", { exact: true })
    .waitFor();
  assert.equal(await addressInput.getAttribute("aria-invalid"), "true");
  await addressInput.fill(`ssh://tester@127.0.0.1:${server.port}`);
  await addressInput.blur();
  assert.equal(await addressInput.inputValue(), "127.0.0.1");
  assert.equal(await portInput.inputValue(), String(server.port));
  assert.equal(
    await page.getByLabel("Username", { exact: true }).inputValue(),
    "tester",
  );
  await page.getByRole("button", { name: "Authentication" }).click();
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Organization" }).click();
  await page.getByLabel("Group", { exact: true }).fill("Development");
  await page.getByRole("button", { name: "Save host" }).click();
  await page.getByRole("heading", { name: "Erkinode integration" }).waitFor();
  await page.getByLabel("More actions", { exact: true }).click();
  await page.getByRole("button", { name: "Edit host", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Delete host", exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "Hosts", exact: false }).click();
  assert.equal(
    await page.getByRole("button", { name: "Edit host", exact: true }).count(),
    0,
  );
  await page.screenshot({ path: "test-results/02-hosts.png" });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  const listCard = page.locator(".hosts.list .host-card").first();
  assert.equal(
    await listCard.evaluate((card) => getComputedStyle(card).flexDirection),
    "row",
  );
  assert.ok(
    (await listCard.evaluate((card) => card.getBoundingClientRect().height)) <
      100,
  );
  await listCard.getByLabel("More actions", { exact: true }).click();
  await listCard
    .getByRole("button", { name: "Edit host", exact: true })
    .waitFor();
  await listCard
    .getByRole("button", { name: "Delete host", exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "Hosts", exact: false }).click();
  await listCard.getByTitle("Add to favorites", { exact: true }).waitFor();
  await page.screenshot({ path: "test-results/02-hosts-list.png" });
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.getByRole("button", { name: "SSH", exact: true }).click();
  await page
    .getByText("Secure connection", { exact: false })
    .waitFor({ timeout: 15000 });
  await page.locator(".terminal .xterm").waitFor();
  // Assert output via public accessibility/DOM bridge; no Chromium or host filesystem access in renderer.
  const security = await page.evaluate(() => ({
    require: typeof window.require,
    process: typeof window.process,
    api: Object.keys(window.erkinode),
  }));
  assert.equal(security.require, "undefined");
  assert.equal(security.process, "undefined");
  await page.locator(".terminal-view").click({ button: "right" });
  await page.getByRole("menu").waitFor();
  for (const action of [
    "Copy",
    "Paste",
    "Search",
    "Insert snippet",
    "Clear terminal",
    "Open SFTP",
    "Disconnect",
  ])
    await page
      .getByRole("menu")
      .getByRole("button", { name: new RegExp(`^${action}`) })
      .waitFor();
  await page.locator(".session-toolbar").click();
  await page.getByRole("menu").waitFor({ state: "detached" });
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("hello-erkinode");
  await page.screenshot({ path: "test-results/03-terminal.png" });
  await page.keyboard.press("Enter");
  await page.keyboard.type("[sudo] password for tester: ");
  await page
    .getByText("sudo is requesting a password", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Use SSH password", exact: true })
    .waitFor();
  await page.screenshot({ path: "test-results/03-sudo-password.png" });
  await page
    .getByRole("button", { name: "Use SSH password", exact: true })
    .click();
  await page
    .getByText("sudo is requesting a password", { exact: true })
    .waitFor({ state: "detached" });
  await page.waitForFunction(async () =>
    (await window.erkinode.invoke("state")).hosts.some(
      (host) => host.system?.id === "ubuntu",
    ),
  );
  await page.getByRole("button", { name: "All hosts", exact: false }).click();
  await page.locator('.host-card svg[data-system-icon="ubuntu"]').waitFor();
  await page.getByText("Ubuntu 24.04 LTS", { exact: true }).waitFor();
  await page.screenshot({ path: "test-results/11-detected-system.png" });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.locator(".hosts.list .host-info .host-system-label").waitFor();
  await page.screenshot({ path: "test-results/12-detected-system-list.png" });
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.getByRole("button", { name: "Connections", exact: false }).click();
  await page.getByRole("button", { name: "SFTP", exact: true }).click();
  await page
    .getByText("hello.txt", { exact: true })
    .waitFor({ timeout: 10000 });
  await page.screenshot({ path: "test-results/04-sftp.png" });
  await page.getByText("hello.txt", { exact: true }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByRole("textbox", { name: "File contents" }).waitFor();
  assert.match(
    await page.getByRole("textbox", { name: "File contents" }).inputValue(),
    /Hello 日本語/,
  );
  await page.getByRole("button", { name: "Close editor" }).click();
  await desktop.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, directory);
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await page
    .locator(".local-files")
    .getByText("local-upload.txt", { exact: true })
    .click();
  await page.getByRole("button", { name: "Upload →", exact: true }).click();
  await page
    .locator(".file-table")
    .getByText("local-upload.txt", { exact: true })
    .waitFor({ timeout: 10000 });
  assert.equal(
    await fs.readFile(path.join(server.root, "local-upload.txt"), "utf8"),
    "Local to SFTP: Unicode transfer: 日本語\n",
  );
  await page
    .getByRole("button", { name: "Close transfers", exact: true })
    .click();
  await page
    .locator(".file-table")
    .getByText("hello.txt", { exact: true })
    .click();
  await page.getByRole("button", { name: "← Download", exact: true }).click();
  await page
    .locator(".local-files")
    .getByText("hello.txt", { exact: true })
    .waitFor({ timeout: 10000 });
  assert.match(
    await fs.readFile(path.join(directory, "hello.txt"), "utf8"),
    /Hello 日本語/,
  );
  await page
    .getByRole("button", { name: "Close transfers", exact: true })
    .click();
  await page.screenshot({ path: "test-results/05-dual-pane.png" });
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page
    .getByRole("button", { name: "Snippets", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "New snippet" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Status");
  await page.getByLabel("Command", { exact: true }).fill("uptime");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "Status", exact: true }).waitFor();
  await page.getByRole("button", { name: "Insert into terminal" }).click();
  // Switching the interface language must not disconnect a live SSH session.
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("ru");
  await page.getByRole("heading", { name: ru.Settings, exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "ru");
  assert.equal(
    (await page.evaluate(() => window.erkinode.invoke("state"))).sessions
      .length,
    1,
  );
  await page.getByLabel(ru.Language, { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "Connections", exact: false }).click();
  await page
    .getByRole("button", { name: "Close Erkinode integration" })
    .click();
  const raw = await fs.readFile(path.join(directory, "vault.json"), "utf8");
  assert.ok(!raw.includes("test-password"));
  // Renderer reload must read the saved preference from the encrypted vault.
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("ru");
  await page.getByRole("heading", { name: ru.Settings, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: ru.Hosts, exact: false }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "ru");
  await page.getByRole("button", { name: ru.Settings, exact: false }).click();
  await page.screenshot({ path: "test-results/08-settings-russian.png" });
  await desktop.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.lastNativeTitle = options.title;
      return { canceled: true, filePaths: [] };
    };
  });
  await page.evaluate(() => window.erkinode.invoke("key:import"));
  assert.equal(
    await desktop.evaluate(() => globalThis.lastNativeTitle),
    ru["Import private SSH key"],
  );
  const nativeLabels = await desktop.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((item) => item.label),
  );
  assert.ok(nativeLabels.includes(ru["menu.edit"]));
  const backendError = await page.evaluate(async () => {
    try {
      await window.erkinode.invoke("settings:save", { language: "unknown" });
    } catch (error) {
      return error.message;
    }
  });
  assert.equal(backendError, ru["Unsupported language"]);
  await page.getByLabel(ru.Language, { exact: true }).selectOption("kk");
  await page.getByRole("heading", { name: kk.Settings, exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: kk.Hosts, exact: false }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "kk");
  await page
    .getByRole("button", { name: kk["New host"], exact: false })
    .click();
  const jumpLabel = await page
    .getByLabel(kk["Jump host"], { exact: true })
    .evaluate(
      (element) =>
        element.closest(".jump-field").querySelector("label").textContent,
    );
  assert.ok(jumpLabel.startsWith(kk["Jump host"] + " (" + kk.optional + ")"));
  await page
    .getByRole("button", { name: kk["About jump hosts"], exact: true })
    .hover();
  await page
    .getByText(
      kk[
        "A jump host is an intermediate SSH server used to reach a private host. Keep Direct connection if your server is reachable directly."
      ],
      { exact: true },
    )
    .waitFor();
  await page.screenshot({ path: "test-results/13-kazakh-host-dialog.png" });
  await page.getByRole("button", { name: kk.Close, exact: true }).click();
  await page.evaluate(() => window.erkinode.invoke("key:import"));
  assert.equal(
    await desktop.evaluate(() => globalThis.lastNativeTitle),
    kk["Import private SSH key"],
  );
  const kazakhMenu = await desktop.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().items.map((item) => item.label),
  );
  assert.ok(kazakhMenu.includes(kk["menu.edit"]));
  await page.getByRole("button", { name: kk.Settings, exact: false }).click();
  await page.screenshot({ path: "test-results/14-kazakh-settings.png" });
  await page.getByLabel(kk.Language, { exact: true }).selectOption("en");
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  const selectLayout = await page
    .getByLabel("Language", { exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        right: parseFloat(style.paddingRight),
        appearance: style.appearance,
        width: element.getBoundingClientRect().width,
      };
    });
  assert.ok(selectLayout.right >= 36 && selectLayout.width >= 116);
  assert.equal(selectLayout.appearance, "none");
  await page.screenshot({ path: "test-results/09-select-spacing.png" });
  // Wrong saved credentials must leave an actionable error after the toast disappears.
  await page.evaluate(
    async (port) =>
      window.erkinode.invoke("host:save", {
        name: "Authentication failure",
        address: "127.0.0.1",
        port,
        username: "tester",
        auth: "password",
        password: "wrong",
      }),
    server.port,
  );
  await page.reload();
  await page
    .locator(".host-card")
    .filter({ hasText: "Authentication failure" })
    .getByRole("button", { name: "SSH", exact: true })
    .click();
  await page
    .locator(".closed-banner")
    .getByText("The server rejected the credentials", { exact: false })
    .waitFor();
  await page.locator(".closed-banner summary").click();
  assert.match(
    await page.locator(".closed-banner").innerText(),
    /All configured authentication methods failed/,
  );
  await page.locator(".toast").waitFor({ state: "hidden", timeout: 12000 });
  assert.ok(await page.locator(".closed-banner").isVisible());
  await page.screenshot({ path: "test-results/10-authentication-error.png" });
  await page
    .locator(".closed-banner")
    .getByRole("button", { name: "Reconnect", exact: true })
    .click();
  await page
    .locator(".closed-banner")
    .getByText("The server rejected the credentials", { exact: false })
    .waitFor();
  assert.equal(await page.locator(".session-tab").count(), 1);
  await page
    .getByRole("button", { name: "Enter password again", exact: true })
    .click();
  await page.locator(".auth-overlay").waitFor();
  await page
    .locator(".auth-overlay input[type=password]")
    .fill("test-password");
  await page
    .locator(".auth-overlay")
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await page.locator(".auth-overlay").waitFor({ state: "hidden" });
  await page.getByText("Secure connection", { exact: false }).waitFor();
  assert.equal(await page.locator(".session-tab").count(), 1);
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByLabel("New PIN", { exact: true }).fill("123456");
  await page.getByLabel("Confirm PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Lock now", exact: true }).click();
  await page.getByRole("heading", { name: "Unlock Erkinode" }).waitFor();
  await page.getByLabel("PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await page.getByLabel("Current PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "UI PASS: host form → encrypted save → SSH → SFTP → editor → local pane → upload/download bytes → snippets; live language switching, persistence, native dialogs, menus, and errors; renderer isolated; no page errors.",
  );
} catch (error) {
  const page = desktop && (await desktop.firstWindow().catch(() => null));
  if (page) {
    await page
      .screenshot({ path: "test-results/ui-failure.png" })
      .catch(() => {});
    console.error((await page.locator("body").innerText()).slice(0, 5000));
  }
  throw error;
} finally {
  await desktop?.close();
  await server.close();
  await fs.rm(directory, { recursive: true, force: true });
}
