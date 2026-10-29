import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fixture } from "../tests/fixture.js";
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "erkinode-terminal-ui-"),
);
const folder = path.join(directory, "folder with spaces");
await fs.mkdir(folder);
const server = await fixture();
let desktop;
try {
  const env = {
    ...process.env,
    ERKINODE_TEST_MODE: "1",
    ERKINODE_TEST_DATA: directory,
    HOME: directory,
    ZDOTDIR: directory,
    HISTFILE: path.join(directory, "history"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = await electron.launch({
    args: ["."],
    env,
  });
  const page = await desktop.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Add host", exact: true }).waitFor();
  await page.evaluate(() => {
    window.localEvents = [];
    window.erkinode.onEvent((event) => {
      if (event.type === "data") window.localEvents.push(event);
    });
  });
  const output = async (id, text) =>
    page.waitForFunction(
      ({ id, text }) =>
        window.localEvents
          .filter((event) => event.sessionId === id)
          .map((event) => event.data)
          .join("")
          .includes(text),
      { id, text },
      { polling: 50, timeout: 10000 },
    );
  const shellReady = async (id) => {
    // Any output proves the lazy PTY has started. A command result proves the
    // shell is accepting input, regardless of PS1, hostname, or shell type.
    await page.waitForFunction(
      (id) =>
        window.localEvents.some(
          (event) => event.sessionId === id && event.data,
        ),
      id,
      { polling: 50, timeout: 30000 },
    );
    const marker = "ERKINODE_" + id.replaceAll("-", "");
    await page.evaluate(
      ({ id, marker }) =>
        window.erkinode.invoke("session:input", {
          id,
          data: `printf '${marker}_%s\\n' READY\r`,
        }),
      { id, marker },
    );
    await output(id, marker + "_READY");
  };
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Local terminal", exact: true })
    .click();
  await page
    .locator(".workspace-footer")
    .getByText("Running on this device", { exact: false })
    .waitFor();
  let sessions = await page.evaluate(
    async () => (await window.erkinode.invoke("state")).sessions,
  );
  assert.equal(sessions.length, 1);
  const first = sessions[0];
  assert.equal(first.kind, "local");
  await shellReady(first.id);
  assert.equal(
    await page
      .locator(".session-pane:not(.offscreen)")
      .getByRole("button", { name: "SFTP", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Tunnel", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .locator(".session-pane:not(.offscreen) .xterm-helper-textarea")
    .focus();
  await page.keyboard.type(
    "printf 'LOCAL_%s\\n' READY; test -t 0 && printf 'TTY_%s\\n' YES",
  );
  await page.keyboard.press("Enter");
  await output(first.id, "LOCAL_READY");
  await output(first.id, "TTY_YES");
  // Native menu is the single shortcut source, so Cmd/Ctrl+T cannot double-spawn.
  const shortcut = await desktop.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().items.find(
      (item) => item.label === "File",
    ).submenu.items[0];
    item.click();
    return item.accelerator;
  });
  assert.equal(
    shortcut,
    process.platform === "darwin" ? "Cmd+T" : "Ctrl+Shift+T",
  );
  await page.waitForFunction(
    async () => (await window.erkinode.invoke("state")).sessions.length === 2,
  );
  await page.waitForFunction(() => {
    const tabs = document.querySelectorAll(".session-tab");
    return (
      tabs.length === 2 &&
      tabs[1]?.classList.contains("active") &&
      document.querySelectorAll(".session-pane:not(.offscreen)").length === 1
    );
  });
  await desktop.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, folder);
  await page
    .locator(".session-pane:not(.offscreen)")
    .getByRole("button", { name: "Open in folder…", exact: true })
    .click();
  await page.waitForFunction(
    async (folder) =>
      (await window.erkinode.invoke("state")).sessions.some(
        (session) => session.cwd === folder,
      ),
    folder,
  );
  sessions = await page.evaluate(
    async () => (await window.erkinode.invoke("state")).sessions,
  );
  const selected = sessions.find((session) => session.cwd === folder);
  await page
    .locator(".session-pane:not(.offscreen) .local-cwd")
    .filter({ hasText: folder })
    .waitFor();
  await shellReady(selected.id);
  await page
    .locator(".session-pane:not(.offscreen) .xterm-helper-textarea")
    .focus();
  await page.keyboard.type("printf 'FOLDER_%s\\n' READY; pwd; sleep 30");
  await page.keyboard.press("Enter");
  await output(selected.id, "FOLDER_READY");
  await output(selected.id, folder);
  // Wait for sleep to become the foreground job before delivering SIGINT.
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+c");
  await page.keyboard.type("printf 'AFTER_%s\\n' INTERRUPT");
  await page.keyboard.press("Enter");
  await output(selected.id, "AFTER_INTERRUPT");
  // A second local shell and an SSH channel can coexist without crossing output.
  await desktop.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await page.getByRole("button", { name: "All hosts", exact: false }).click();
  await page.getByRole("button", { name: "New host", exact: false }).click();
  await page.getByLabel("Name", { exact: true }).fill("SSH beside local");
  await page.getByLabel("Host address", { exact: true }).fill("127.0.0.1");
  await page.getByLabel("Port", { exact: true }).fill(String(server.port));
  await page.getByLabel("Username", { exact: true }).fill("tester");
  await page
    .getByRole("button", { name: "Authentication", exact: false })
    .click();
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Save host", exact: true }).click();
  await page.getByRole("button", { name: "SSH", exact: true }).click();
  await page.getByText("Secure connection", { exact: false }).waitFor();
  assert.equal(
    (await page.evaluate(() => window.erkinode.invoke("state"))).sessions
      .length,
    4,
  );
  await page.locator(".session-tab").nth(2).locator("button").first().click();
  await page
    .getByRole("button", { name: "Split connections", exact: false })
    .click();
  assert.equal(
    await page
      .locator(".session-panes.split .session-pane:not(.offscreen)")
      .count(),
    2,
  );
  await page.screenshot({ path: "test-results/15-local-terminals.png" });
  await page
    .getByRole("button", { name: "Split connections", exact: false })
    .click();
  await page
    .locator(".session-pane:not(.offscreen) .xterm-helper-textarea")
    .focus();
  await page.keyboard.type("exit");
  await page.keyboard.press("Enter");
  await page
    .locator(".session-pane:not(.offscreen)")
    .getByText("Local terminal closed", { exact: true })
    .waitFor();
  await page
    .locator(".closed-banner")
    .getByRole("button", { name: "New local terminal", exact: true })
    .click();
  await page.waitForFunction(
    async (id) =>
      !(await window.erkinode.invoke("state")).sessions.some(
        (session) => session.id === id,
      ),
    selected.id,
  );
  sessions = await page.evaluate(
    async () => (await window.erkinode.invoke("state")).sessions,
  );
  assert.equal(sessions.length, 4);
  assert.equal(
    sessions.filter(
      (session) => session.kind === "local" && session.status === "ready",
    ).length,
    3,
  );
  // Closing tabs must dispose the process as well as the renderer.
  for (
    let count = await page.locator(".session-tab").count();
    count > 0;
    count--
  ) {
    await page.locator(".session-tab > button[aria-label]").last().click();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll(".session-tab").length === expected,
      count - 1,
    );
  }
  assert.equal(
    (await page.evaluate(() => window.erkinode.invoke("state"))).sessions
      .length,
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "LOCAL TERMINAL UI PASS: native menu, multiple tabs, folder picker, TTY input, Ctrl+C, split panes, exit/restart, and cleanup.",
  );
} catch (error) {
  if (desktop) {
    const page = await desktop.firstWindow();
    console.log(await page.locator("body").innerText());
    console.log(await page.evaluate(() => window.localEvents.slice(-10)));
    await page.screenshot({ path: "test-results/local-terminal-failure.png" });
  }
  throw error;
} finally {
  if (desktop) await desktop.close();
  await server.close();
  await fs.rm(directory, { recursive: true, force: true });
}
