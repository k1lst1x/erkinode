import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { t } from "./i18n.js";
import { terminatePty } from "./process-tree.js";
const require = createRequire(import.meta.url);

export function shellProfile(
  platform = process.platform,
  env = process.env,
  user = os.userInfo(),
  exists = fs.existsSync,
) {
  if (platform === "win32") {
    const powershell = path.win32.join(
      env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const core = path.win32.join(
      env.ProgramFiles || "C:\\Program Files",
      "PowerShell",
      "7",
      "pwsh.exe",
    );
    const file = [core, powershell, env.ComSpec].find(
      (file) => file && exists(file),
    );
    if (!file) throw new Error(t("No local shell was found on this device."));
    return {
      file,
      args: /(?:pwsh|powershell)\.exe$/i.test(file) ? ["-NoLogo"] : [],
    };
  }
  const file = [
    user.shell,
    env.SHELL,
    platform === "darwin" ? "/bin/zsh" : "/bin/bash",
    "/bin/sh",
  ].find((file) => file && path.posix.isAbsolute(file) && exists(file));
  if (!file) throw new Error(t("No local shell was found on this device."));
  // Login shells load the same PATH and configuration as a normal terminal.
  return {
    file,
    args: /^(?:zsh|bash|sh|dash|ksh|fish)$/.test(path.basename(file))
      ? ["-l"]
      : [],
  };
}
export function terminalEnvironment(env = process.env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      typeof value !== "string" ||
      /^(?:ELECTRON_|ERKINODE_|NODE_OPTIONS$|NODE_PATH$|VSCODE_|TERM_PROGRAM(?:_VERSION)?$)/i.test(
        key,
      )
    )
      continue;
    result[key] = value;
  }
  return {
    ...result,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "Erkinode",
  };
}
const dimensions = (cols, rows) => ({
  cols: Number.isInteger(cols) && cols >= 20 && cols <= 400 ? cols : 100,
  rows: Number.isInteger(rows) && rows >= 5 && rows <= 200 ? rows : 30,
});

export class LocalTerminals {
  constructor({ emit = () => {}, spawn, profile, home = os.homedir() } = {}) {
    this.emit = emit;
    this.spawn = spawn;
    this.profile = profile;
    this.home = home;
    this.sessions = new Map();
  }
  open(cwd = this.home) {
    if (this.sessions.size >= 32)
      throw new Error(t("Close a local terminal before opening another."));
    let valid = false;
    try {
      valid =
        typeof cwd === "string" &&
        path.isAbsolute(cwd) &&
        fs.statSync(cwd).isDirectory();
    } catch {}
    if (!valid) throw new Error(t("Choose an existing local folder."));
    const profile = this.profile || shellProfile();
    const session = {
      id: randomUUID(),
      kind: "local",
      hostId: "",
      name: path.basename(profile.file.replaceAll("\\", "/")),
      shell: profile.file,
      cwd,
      hostname: os.hostname(),
      status: "ready",
      mode: "terminal",
      profile,
      pending: 0,
      pty: null,
    };
    this.sessions.set(session.id, session);
    return this.describe(session);
  }
  describe({ id, kind, hostId, name, shell, cwd, hostname, status, mode }) {
    return { id, kind, hostId, name, shell, cwd, hostname, status, mode };
  }
  list() {
    return [...this.sessions.values()].map((session) => this.describe(session));
  }
  get(id) {
    const session = this.sessions.get(id);
    if (!session || session.status === "closed")
      throw new Error(t("Local terminal closed"));
    return session;
  }
  shell(id, cols, rows) {
    const session = this.get(id);
    if (session.pty) return;
    try {
      const spawn = this.spawn || require("node-pty").spawn;
      const pty = spawn(session.profile.file, session.profile.args, {
        name: "xterm-256color",
        ...dimensions(cols, rows),
        cwd: session.cwd,
        env: terminalEnvironment(),
        useConpty: true,
      });
      session.pty = pty;
      session.dataListener = pty.onData((output) => {
        if (session.status === "closed") return;
        // Keep acknowledgements small even when a program emits a large burst.
        for (let i = 0; i < output.length;) {
          let end = Math.min(i + 8192, output.length);
          const last = output.charCodeAt(end - 1);
          if (end < output.length && last >= 0xd800 && last <= 0xdbff) end++;
          const data = output.slice(i, end),
            bytes = Buffer.byteLength(data);
          i = end;
          session.pending += bytes;
          this.emit({ type: "data", sessionId: id, data, bytes });
        }
        if (session.pending > 256 * 1024) pty.pause();
      });
      session.exitListener = pty.onExit(({ exitCode, signal }) => {
        session.status = "closed";
        session.pty = null;
        this.emit({
          type: "status",
          sessionId: id,
          status: "closed",
          exitCode,
          signal,
        });
      });
    } catch (error) {
      session.status = "closed";
      this.emit({
        type: "status",
        sessionId: id,
        status: "closed",
        message: t("Could not start the local shell."),
        details: error.message,
      });
      throw new Error(t("Could not start the local shell."));
    }
  }
  input(id, data) {
    const session = this.get(id);
    if (typeof data !== "string" || Buffer.byteLength(data) > 65536)
      throw new Error(t("Input is too large"));
    if (!session.pty) throw new Error(t("Terminal is not open yet"));
    session.pty.write(data);
  }
  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (
      session?.pty &&
      Number.isInteger(cols) &&
      cols >= 20 &&
      cols <= 400 &&
      Number.isInteger(rows) &&
      rows >= 5 &&
      rows <= 200
    )
      session.pty.resize(cols, rows);
  }
  ack(id, bytes) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (!Number.isInteger(bytes) || bytes < 0 || bytes > 65536) return;
    session.pending = Math.max(0, session.pending - bytes);
    if (session.pending < 64 * 1024) session.pty?.resume();
  }
  close(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = "closed";
    session.dataListener?.dispose();
    session.exitListener?.dispose();
    terminatePty(session.pty);
    this.sessions.delete(id);
  }
  closeAll() {
    for (const id of this.sessions.keys()) this.close(id);
  }
}
