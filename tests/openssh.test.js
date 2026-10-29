import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { Connections } from "../electron/connections.js";
import { Vault } from "../electron/vault.js";

test(
  "independent OpenSSH server: public key login, PTY, SFTP and atomic text save",
  { timeout: 20000 },
  async (t) => {
    if (
      process.platform !== "darwin" ||
      process.env.ERKINODE_OPENSSH_TEST !== "1"
    )
      return t.skip(
        "Opt-in macOS interoperability test: ERKINODE_OPENSSH_TEST=1",
      );
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "erkinode-openssh-"),
    );
    let server, connections;
    let diagnostics = "";
    t.after(async () => {
      connections?.closeAll();
      server?.kill();
      await fs.rm(directory, { recursive: true, force: true });
    });
    const key = path.join(directory, "identity"),
      hostKey = path.join(directory, "hostkey");
    for (const target of [key, hostKey])
      execFileSync("/usr/bin/ssh-keygen", [
        "-t",
        "ed25519",
        "-N",
        "",
        "-f",
        target,
        "-q",
      ]);
    const listener = net.createServer();
    await new Promise((r) => listener.listen(0, "127.0.0.1", r));
    const port = listener.address().port;
    await new Promise((r) => listener.close(r));
    const config = path.join(directory, "sshd_config");
    await fs.writeFile(
      config,
      `ListenAddress 127.0.0.1\nPort ${port}\nHostKey ${hostKey}\nPidFile ${directory}/pid\nAuthorizedKeysFile ${key}.pub\nStrictModes no\nUsePAM no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPubkeyAuthentication yes\nSubsystem sftp internal-sftp\nLogLevel VERBOSE\n`,
    );
    server = spawn("/usr/sbin/sshd", ["-D", "-e", "-f", config], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    server.stderr.on("data", (d) => {
      diagnostics += d;
    });
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (diagnostics.includes("Server listening")) {
          clearInterval(timer);
          resolve();
        } else if (server.exitCode !== null) {
          clearInterval(timer);
          reject(new Error(diagnostics));
        }
      }, 20);
    });
    const vault = new Vault(path.join(directory, "vault"), {
      encrypt: async (s) => Buffer.from(s),
    });
    const host = await vault.saveHost({
      name: "OpenSSH test",
      address: "127.0.0.1",
      port,
      username: os.userInfo().username,
      auth: "key",
      privateKey: await fs.readFile(key, "utf8"),
    });
    let output = "";
    let readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    connections = new Connections(vault, {
      verify: async () => true,
      emit: (e) => {
        if (e.type === "status" && e.status === "ready") readyResolve();
        if (e.type === "error")
          readyReject(new Error(`${e.message}\n${diagnostics}`));
        if (e.type === "data") {
          output += e.data;
          connections.ack(e.sessionId, e.bytes);
        }
      },
    });
    const id = connections.open(host.id);
    await ready;
    await connections.shell(id);
    connections.input(id, "printf 'erkinode-openssh-ok\\n'\r");
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (output.includes("erkinode-openssh-ok")) {
          clearInterval(timer);
          resolve();
        }
      }, 20);
    });
    const file = path.join(directory, "editable.txt");
    await fs.writeFile(file, "before\n");
    const list = await connections.listFiles(id, directory);
    assert.ok(list.files.some((f) => f.name === "editable.txt"));
    const original = await connections.readText(id, file);
    await connections.writeText(id, file, "after\n", original.revision);
    assert.equal(await fs.readFile(file, "utf8"), "after\n");
    connections.close(id);
  },
);
