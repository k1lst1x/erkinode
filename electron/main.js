import "./system-errors.js";
import { t, setLanguage, i18n } from "./i18n.js";
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  protocol,
  net,
  Menu,
  shell,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import ssh2 from "ssh2";
import { Vault } from "./vault.js";
import { Connections } from "./connections.js";
import { Transfers } from "./transfer-manager.js";
import { LocalTerminals } from "./local-terminals.js";
import { LocalFiles } from "./local-files.js";
import { remotePath } from "./schema.js";
import { PRODUCT_NAME, PRODUCT_SLUG, STORAGE_NAME } from "./brand.js";
import { checkForUpdate, isReleaseUrl } from "./update-check.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const { utils } = ssh2;
const testMode = !app.isPackaged && process.env.ERKINODE_TEST_MODE === "1";
if (testMode && process.env.ERKINODE_TEST_DATA)
  app.setPath("userData", process.env.ERKINODE_TEST_DATA);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "erkinode",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
// Keep this identity stable after publication so upgrades can reopen the vault.
app.setName(STORAGE_NAME);
if (!testMode)
  app.setPath("userData", path.join(app.getPath("appData"), STORAGE_NAME));
app.setAboutPanelOptions({
  applicationName: PRODUCT_NAME,
  applicationVersion: app.getVersion(),
  copyright: t("Copyright © 2026 Erkinode contributors · MIT OR Apache-2.0"),
});
let win,
  vault,
  connections,
  transfers,
  quitting = false;
const prompts = new Map();
const localFiles = new LocalFiles();
const emit = (event) => {
  if (win && !win.isDestroyed()) win.webContents.send("erkinode:event", event);
};
const localTerminals = new LocalTerminals({
  emit,
  ...(testMode && process.env.ERKINODE_TEST_SHELL
    ? { profile: { file: process.env.ERKINODE_TEST_SHELL, args: ["-l"] } }
    : {}),
});
const terminalOwner = (id) =>
  localTerminals.sessions.has(id) ? localTerminals : connections;
const request = (title, fields, description = "") =>
  new Promise((resolve) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      prompts.delete(id);
      emit({ type: "prompt-expired", id });
      resolve(null);
    }, 110000);
    prompts.set(id, (answer) => {
      clearTimeout(timer);
      prompts.delete(id);
      resolve(answer);
    });
    emit({ type: "prompt", id, title, description, fields });
  });
async function protector() {
  if (testMode) {
    const key = randomBytes(32);
    return {
      encrypt: async (text) => {
        const iv = randomBytes(12),
          cipher = createCipheriv("aes-256-gcm", key, iv);
        const encrypted = Buffer.concat([
          cipher.update(text, "utf8"),
          cipher.final(),
        ]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
      },
      decrypt: async (b) => {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          b.subarray(0, 12),
        );
        decipher.setAuthTag(b.subarray(12, 28));
        return Buffer.concat([
          decipher.update(b.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
      },
    };
  }
  return {
    async encrypt(text) {
      if (!(await safeStorage.isAsyncEncryptionAvailable()))
        throw new Error(
          t(
            "The system credential store is unavailable. Passwords will not be stored without encryption.",
          ),
        );
      if (
        process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text"
      )
        throw new Error(
          t(
            "Enable GNOME Keyring or KWallet. Insecure storage is not allowed.",
          ),
        );
      return safeStorage.encryptStringAsync(text);
    },
    async decrypt(buffer) {
      return (await safeStorage.decryptStringAsync(buffer)).result;
    },
  };
}
const handlers = {
  state: () => ({
    ...vault.snapshot(),
    sessions: [...connections.list(), ...localTerminals.list()],
    version: app.getVersion(),
    platform: process.platform,
  }),
  "update:check": () =>
    testMode
      ? { available: false, currentVersion: app.getVersion() }
      : checkForUpdate(app.getVersion()),
  "update:open": async ({ url } = {}) => {
    if (!isReleaseUrl(url)) throw new Error("Invalid release URL");
    await shell.openExternal(url);
    return true;
  },
  "host:save": (input) => vault.saveHost(input),
  "host:delete": async (id) => {
    if ([...connections.sessions.values()].some((s) => s.host.id === id))
      throw new Error(t("Close connections to this host first"));
    return vault.deleteHost(id);
  },
  "key:import": async () => {
    const selected = await dialog.showOpenDialog(win, {
      title: t("Import private SSH key"),
      properties: ["openFile", "showHiddenFiles"],
      defaultPath: path.join(os.homedir(), ".ssh"),
    });
    if (selected.canceled) return null;
    const stat = await fs.stat(selected.filePaths[0]);
    if (stat.size > 65536) throw new Error(t("The key file is too large"));
    const text = await fs.readFile(selected.filePaths[0], "utf8");
    if (
      !/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(
        text,
      )
    )
      throw new Error(t("Choose a private SSH key, not a .pub file"));
    return text;
  },
  "key:generate": async () => {
    const keys = await new Promise((resolve, reject) =>
      utils.generateKeyPair("ed25519", { comment: PRODUCT_SLUG }, (e, keys) =>
        e ? reject(e) : resolve(keys),
      ),
    );
    return { privateKey: keys.private, publicKey: keys.public };
  },
  "session:open": ({ hostId, cols, rows, promptPassword, sessionId }) =>
    connections.open(hostId, { cols, rows, promptPassword }, sessionId),
  "local:open-terminal": async ({ chooseFolder = false } = {}) => {
    if (typeof chooseFolder !== "boolean")
      throw new Error(t("Invalid response"));
    let cwd;
    if (chooseFolder) {
      const selected = await dialog.showOpenDialog(win, {
        title: t("Open terminal in folder"),
        properties: ["openDirectory"],
        defaultPath: os.homedir(),
      });
      if (selected.canceled) return null;
      cwd = selected.filePaths[0];
    }
    return localTerminals.open(cwd);
  },
  "session:shell": ({ id, cols, rows }) =>
    localTerminals.sessions.has(id)
      ? localTerminals.shell(id, cols, rows)
      : connections.shell(id, { cols, rows }),
  "session:close": (id) => {
    transfers.cancelSession(id);
    terminalOwner(id).close(id);
  },
  "session:input": ({ id, data }) => terminalOwner(id).input(id, data),
  "session:resize": ({ id, cols, rows }) =>
    terminalOwner(id).resize(id, cols, rows),
  "sftp:list": ({ id, path: dir }) => connections.listFiles(id, dir),
  "sftp:action": async ({ id, action, path: file, value }) => {
    remotePath.parse(file);
    if (["remove", "chmod"].includes(action)) {
      const choice = await dialog.showMessageBox(win, {
        type: "warning",
        message:
          action === "remove"
            ? t("Delete {{file}}?", { file })
            : t("Change permissions for {{file}}?", { file }),
        detail:
          action === "remove"
            ? t(
                "Remote deletion cannot be undone. Non-empty folders will not be deleted.",
              )
            : t("New permissions: {{mode}}", {
                mode: Number(value).toString(8),
              }),
        buttons: [t("Cancel"), t("Confirm")],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice.response !== 1) return { cancelled: true };
    }
    return connections.fileAction(id, action, file, value);
  },
  "sftp:read": ({ id, path: file }) => connections.readText(id, file),
  "sftp:write": ({ id, path: file, text, revision }) =>
    connections.writeText(id, file, text, revision),
  "transfer:upload": async ({ id, directory }) => {
    remotePath.parse(directory);
    connections.ready(id);
    const selected = await dialog.showOpenDialog(win, {
      title: t("Upload files or folders to server"),
      properties: ["openFile", "openDirectory", "multiSelections"],
    });
    if (selected.canceled) return [];
    const ids = [];
    for (const file of selected.filePaths) {
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory()))
        throw new Error(t("Choose a regular file or folder"));
      ids.push(
        transfers.start({
          sessionId: id,
          direction: "upload",
          local: file,
          remote: path.posix.join(directory, path.basename(file)),
          size: stat.size,
          directory: stat.isDirectory(),
        }),
      );
    }
    return ids;
  },
  "transfer:download": async ({ id, path: file }) => {
    remotePath.parse(file);
    const sftp = await connections.sftp(id);
    const stat = await new Promise((resolve, reject) =>
      sftp.stat(file, (e, st) => (e ? reject(e) : resolve(st))),
    );
    if (stat.isDirectory()) {
      const selected = await dialog.showOpenDialog(win, {
        title: t("Where should the folder be downloaded?"),
        properties: ["openDirectory", "createDirectory"],
      });
      if (selected.canceled) return null;
      return transfers.start({
        sessionId: id,
        direction: "download",
        local: path.join(
          selected.filePaths[0],
          path.posix.basename(file) || "server-root",
        ),
        remote: file,
        directory: true,
      });
    }
    if (!stat.isFile()) throw new Error(t("Choose a regular file or folder"));
    const chosen = await dialog.showSaveDialog(win, {
      title: t("Save file"),
      defaultPath: path.join(
        app.getPath("downloads"),
        path.posix.basename(file),
      ),
    });
    if (chosen.canceled || !chosen.filePath) return null;
    try {
      await fs.lstat(chosen.filePath);
      throw new Error(
        t(
          "Choose a new name. Erkinode does not overwrite existing files when downloading.",
        ),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return transfers.start({
      sessionId: id,
      direction: "download",
      local: chosen.filePath,
      remote: file,
      size: stat.size,
    });
  },
  "transfer:cancel": (id) => transfers.cancel(id),
  "local:choose": async () => {
    const selected = await dialog.showOpenDialog(win, {
      title: t("Allow Erkinode to access a local folder"),
      properties: ["openDirectory", "createDirectory"],
    });
    return selected.canceled ? null : localFiles.grant(selected.filePaths[0]);
  },
  "local:list": (directory) => localFiles.list(directory),
  "transfer:upload-local": async ({ id, local, directory }) => {
    remotePath.parse(directory);
    const resolved = await localFiles.resolve(local),
      st = await fs.lstat(resolved);
    return transfers.start({
      sessionId: id,
      direction: "upload",
      local: resolved,
      remote: path.posix.join(directory, path.basename(resolved)),
      size: st.size,
      directory: st.isDirectory(),
    });
  },
  "transfer:download-local": async ({ id, path: file, localDirectory }) => {
    remotePath.parse(file);
    const local = await localFiles.resolve(localDirectory),
      sftp = await connections.sftp(id);
    if (!(await fs.stat(local)).isDirectory())
      throw new Error(t("Choose a destination folder"));
    const name = path.posix.basename(file);
    if (!name || name === "." || name === ".." || /[\\\0]/.test(name))
      throw new Error(t("Invalid name"));
    const st = await new Promise((resolve, reject) =>
      sftp.lstat(file, (e, result) => (e ? reject(e) : resolve(result))),
    );
    if (st.isSymbolicLink())
      throw new Error(t("Symbolic link transfers are not supported"));
    return transfers.start({
      sessionId: id,
      direction: "download",
      local: path.join(local, name),
      remote: file,
      size: st.size,
      directory: st.isDirectory(),
    });
  },
  "snippet:save": (input) => vault.saveSnippet(input),
  "snippet:delete": (id) => vault.deleteSnippet(id),
  "known:forget": async (address) => {
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      message: t("Remove trusted fingerprint?"),
      detail: t(
        "{{address}}\nYou will need to verify the key again on the next connection. If it changed unexpectedly, contact your administrator first.",
        { address },
      ),
      buttons: [t("Cancel"), t("Delete")],
      cancelId: 0,
      defaultId: 0,
    });
    if (result.response === 1) await vault.forget(address);
  },
  "settings:save": async (input) => {
    await vault.settings(input);
    await setLanguage(vault.snapshot().settings.language);
    updateApplicationMenu();
    return vault.snapshot().settings;
  },
  "tunnel:start": (input) => connections.tunnel(input),
  "tunnel:stop": (id) => connections.stopTunnel(id),
  "backup:export": async (password) => {
    const chosen = await dialog.showSaveDialog(win, {
      title: t("Encrypted backup"),
      defaultPath: "erkinode-backup.vault",
      filters: [{ name: t("Erkinode encrypted vault"), extensions: ["vault"] }],
    });
    if (chosen.canceled) return false;
    await fs.writeFile(chosen.filePath, vault.backup(password), {
      mode: 0o600,
    });
    return true;
  },
  "backup:restore": async (password) => {
    if (connections.sessions.size)
      throw new Error(t("Close all connections before restoring"));
    const chosen = await dialog.showOpenDialog(win, {
      title: t("Restore backup"),
      properties: ["openFile"],
      filters: [{ name: t("Erkinode encrypted vault"), extensions: ["vault"] }],
    });
    if (chosen.canceled) return false;
    const stat = await fs.stat(chosen.filePaths[0]);
    if (stat.size > 16 * 1024 * 1024)
      throw new Error(t("The file is too large"));
    const confirmation = await dialog.showMessageBox(win, {
      type: "warning",
      message: t("Replace the current vault with this backup?"),
      buttons: [t("Cancel"), t("Restore")],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirmation.response !== 1) return false;
    await vault.restore(
      await fs.readFile(chosen.filePaths[0], "utf8"),
      password,
    );
    await setLanguage(vault.snapshot().settings.language);
    updateApplicationMenu();
    return true;
  },
  "prompt:answer": ({ id, answers }) => {
    if (
      answers !== null &&
      (!Array.isArray(answers) ||
        answers.length > 20 ||
        answers.some((a) => typeof a !== "string" || a.length > 16000))
    )
      throw new Error(t("Invalid response"));
    prompts.get(id)?.(answers);
  },
};

function authorized(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    event.senderFrame.url !== "erkinode://app/index.html"
  )
    throw new Error(t("Access denied"));
}
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: "#101315",
    title: PRODUCT_NAME,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 22, y: 20 },
    webPreferences: {
      preload: path.join(root, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.on("render-process-gone", () => localTerminals.closeAll());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.on("close", (event) => {
    if (
      !quitting &&
      (connections.sessions.size ||
        localTerminals.sessions.size ||
        transfers.jobs.size)
    ) {
      event.preventDefault();
      dialog
        .showMessageBox(win, {
          type: "question",
          message: t("Close active connections and this window?"),
          detail: t(
            "File transfers and local terminal processes will be stopped.",
          ),
          buttons: [t("Stay"), t("Close")],
          cancelId: 0,
          defaultId: 0,
        })
        .then((result) => {
          if (result.response === 1) {
            quitting = true;
            transfers.cancelAll();
            connections.closeAll();
            localTerminals.closeAll();
            win.close();
          }
        });
    }
  });
  win.on("closed", () => {
    for (const answer of [...prompts.values()]) answer(null);
    connections.closeAll();
    localTerminals.closeAll();
    win = null;
  });
  win.loadURL("erkinode://app/index.html");
}

function updateApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: PRODUCT_NAME,
            submenu: [
              { role: "about", label: t("About Erkinode") },
              { type: "separator" },
              { role: "hide", label: t("Hide Erkinode") },
              { role: "hideOthers", label: t("Hide others") },
              { role: "unhide", label: t("Show all") },
              { type: "separator" },
              { role: "quit", label: t("Quit Erkinode") },
            ],
          },
        ]
      : []),
    {
      label: t("File"),
      submenu: [
        {
          label: t("New local terminal"),
          accelerator: process.platform === "darwin" ? "Cmd+T" : "Ctrl+Shift+T",
          click: () => emit({ type: "new-local-terminal" }),
        },
        {
          label: t("Open terminal in folder"),
          accelerator:
            process.platform === "darwin" ? "Cmd+Shift+T" : "Ctrl+Alt+T",
          click: () => emit({ type: "new-local-terminal", chooseFolder: true }),
        },
        { type: "separator" },
        {
          label: t("Close tab"),
          accelerator: process.platform === "darwin" ? "Cmd+W" : "Ctrl+Shift+W",
          click: () => emit({ type: "close-active-tab" }),
        },
      ],
    },
    {
      label: t("menu.edit"),
      submenu: [
        { role: "undo", label: t("Undo") },
        { role: "redo", label: t("Redo") },
        { type: "separator" },
        { role: "cut", label: t("Cut") },
        { role: "copy", label: t("Copy") },
        { role: "paste", label: t("Paste") },
        { role: "selectAll", label: t("Select all") },
      ],
    },
    {
      label: t("View"),
      submenu: [
        { role: "togglefullscreen", label: t("Toggle fullscreen") },
        ...(!app.isPackaged
          ? [{ role: "toggleDevTools", label: t("Developer tools") }]
          : []),
      ],
    },
    {
      label: t("Window"),
      submenu: [
        { role: "minimize", label: t("Minimize") },
        { role: "zoom", label: t("Zoom") },
        { role: "front", label: t("Bring all to front") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock() && !testMode) app.quit();
else {
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      protocol.handle("erkinode", (req) => {
        const url = new URL(req.url);
        if (url.hostname !== "app" || req.method !== "GET")
          return new Response("Forbidden", { status: 403 });
        const base = path.resolve(root, "../dist"),
          file = path.resolve(base, `.${decodeURIComponent(url.pathname)}`);
        if (!file.startsWith(base + path.sep))
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(file).href);
      });
      vault = new Vault(
        path.join(app.getPath("userData"), "vault.json"),
        await protector(),
      );
      try {
        await vault.load();
        await setLanguage(vault.snapshot().settings.language);
      } catch (e) {
        dialog.showErrorBox(
          t("Could not open vault"),
          t(
            "{{error}}\nThe file has not been modified. Do not delete it. Check access to the system credential store or restore a backup.",
            { error: t(e.message) },
          ),
        );
        app.quit();
        return;
      }
      connections = new Connections(vault, {
        emit,
        verify: async (host, fp) =>
          (
            await dialog.showMessageBox(win, {
              type: "warning",
              message: t("First connection to {{name}}", { name: host.name }),
              detail: t(
                "{{address}}:{{port}}\n\nKey fingerprint:\n{{fingerprint}}\n\nVerify it with your administrator through another channel. Trust this host?",
                { address: host.address, port: host.port, fingerprint: fp },
              ),
              buttons: [t("Cancel"), t("Trust and connect")],
              defaultId: 0,
              cancelId: 0,
            })
          ).response === 1,
        authenticate: async (host) => {
          const result = await request(
            t("Password for {{username}}@{{address}}", {
              username: host.username,
              address: host.address,
            }),
            [{ label: t("Password"), secret: true }],
            t(
              "For this connection only. Use host settings to save credentials.",
            ),
          );
          return result?.[0] ?? null;
        },
        challenge: (host, name, instructions, fields) =>
          request(
            t("Authentication challenge · {{name}}", { name: host.name }),
            fields.map((f) => ({ label: f.prompt, secret: !f.echo })),
            [name, instructions].filter(Boolean).join("\n"),
          ),
      });
      transfers = new Transfers(connections, emit);
      ipcMain.handle("erkinode:invoke", async (event, method, args) => {
        try {
          authorized(event);
          if (typeof method !== "string" || !Object.hasOwn(handlers, method))
            throw new Error(t("Unknown command"));
          return { ok: true, value: await handlers[method](args) };
        } catch (e) {
          return {
            ok: false,
            error:
              e?.issues?.[0] && !i18n.exists(e.issues[0].message)
                ? t("Invalid value for {{field}}", {
                    field: t(
                      {
                        name: "Name",
                        address: "Host address",
                        port: "Port",
                        username: "Username",
                        command: "Command",
                        targetHost: "Destination address",
                        targetPort: "Destination port",
                        localPort: "Local port",
                      }[e.issues[0].path?.[0]] || "Input",
                    ),
                  })
                : t(e?.issues?.[0]?.message || e.message || "Operation failed"),
          };
        }
      });
      ipcMain.on("erkinode:ack", (event, id, bytes) => {
        try {
          authorized(event);
          terminalOwner(id).ack(id, bytes);
        } catch {}
      });
      updateApplicationMenu();
      createWindow();
      app.on("activate", () => {
        if (!win) {
          quitting = false;
          createWindow();
        }
      });
    })
    .catch((e) => {
      dialog.showErrorBox(PRODUCT_NAME, e.message);
      app.quit();
    });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  quitting = true;
  transfers?.cancelAll();
  connections?.closeAll();
  localTerminals.closeAll();
});
