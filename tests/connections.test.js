import { test } from "node:test";
import assert from "node:assert/strict";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { once } from "node:events";
import { fixture } from "./fixture.js";
import { Connections, endpoint } from "../electron/connections.js";
import { Transfers } from "../electron/transfer-manager.js";
import { Vault } from "../electron/vault.js";

const wait = (check, timeout = 10000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const value = check();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error("Timed out"));
      }
    }, 10);
  });
async function setup(t, options = {}) {
  const fixtureServer = await fixture(options.fixtureOptions),
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-client-"));
  const vault = new Vault(path.join(directory, "vault"), {
    encrypt: async (s) => Buffer.from(s),
    decrypt: async (b) => b.toString(),
  });
  const host = await vault.saveHost({
    name: "Integration",
    address: "127.0.0.1",
    port: fixtureServer.port,
    username: "tester",
    password: "test-password",
  });
  const events = [];
  let checks = 0;
  const manager = new Connections(vault, {
    emit: (e) => events.push(e),
    verify: async () => {
      checks++;
      return true;
    },
    ...options,
  });
  t.after(async () => {
    manager.closeAll();
    await fixtureServer.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    fixtureServer,
    directory,
    vault,
    host,
    manager,
    events,
    checks: () => checks,
  };
}
test("SSH password login, host verification, PTY, Unicode I/O, resize, and clean close", async (t) => {
  const { manager, host, events, vault, checks } = await setup(t);
  const id = manager.open(host.id);
  await wait(() =>
    events.find((e) => e.type === "status" && e.status === "ready"),
  );
  assert.equal(checks(), 1);
  assert.ok(vault.data.knownHosts[endpoint(host)].startsWith("SHA256:"));
  await manager.shell(id);
  manager.input(id, "Hello 日本語\r");
  manager.resize(id, 120, 40);
  await wait(() =>
    events.find((e) => e.type === "data" && e.data.includes("Hello 日本語")),
  );
  manager.close(id);
  assert.equal(manager.sessions.size, 0);
  const second = manager.open(host.id);
  await wait(() =>
    events.find((e) => e.sessionId === second && e.status === "ready"),
  );
  assert.equal(checks(), 1);
});
test("unknown rejected keys and changed keys cannot connect", async (t) => {
  const s = await setup(t, { verify: async () => false });
  const id = s.manager.open(s.host.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === id && e.status === "closed"),
  );
  assert.equal(Object.keys(s.vault.data.knownHosts).length, 0);
  await s.vault.trust(endpoint(s.host), "SHA256:WRONGKEY");
  const changed = s.manager.open(s.host.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === changed && e.status === "closed"),
  );
  assert.ok(s.events.some((e) => e.message?.includes("has changed")));
});
test("bad credentials fail and jump host chains work with cycle rejection", async (t) => {
  const s = await setup(t);
  const bad = await s.vault.saveHost({
    ...s.host,
    id: undefined,
    password: "wrong",
  });
  const failed = s.manager.open(bad.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === failed && e.status === "closed"),
  );
  const target = await s.vault.saveHost({
    ...s.host,
    id: undefined,
    jumpId: s.host.id,
    password: "test-password",
  });
  const id = s.manager.open(target.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === id && e.status === "ready"),
  );
  await s.vault.saveHost({ ...s.host, jumpId: target.id });
  const loop = s.manager.open(target.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === loop && e.status === "closed"),
  );
  assert.ok(s.events.some((e) => e.message?.includes("cycle")));
});
test("SFTP list, text editor conflict protection, mkdir, rename, chmod, delete", async (t) => {
  const s = await setup(t),
    id = s.manager.open(s.host.id);
  await wait(() => s.events.find((e) => e.status === "ready"));
  const listing = await s.manager.listFiles(id, ".");
  assert.equal(listing.path, "/");
  assert.ok(listing.files.find((f) => f.name === "hello.txt"));
  const text = await s.manager.readText(id, "/hello.txt");
  assert.match(text.text, /Hello 日本語/);
  // Fixture advertises SFTP v3 without POSIX rename, so editor must fail safely rather than truncate.
  await assert.rejects(
    s.manager.writeText(id, "/hello.txt", "changed", text.revision),
  );
  assert.match(
    await fs.readFile(path.join(s.fixtureServer.root, "hello.txt"), "utf8"),
    /Hello 日本語/,
  );
  await fs.writeFile(
    path.join(s.fixtureServer.root, "hello.txt"),
    "external edit",
  );
  await assert.rejects(
    s.manager.writeText(id, "/hello.txt", "overwrite", text.revision),
    /changed/,
  );
  await s.manager.fileAction(id, "mkdir", "/new-dir");
  await s.manager.fileAction(id, "rename", "/new-dir", "/renamed");
  await s.manager.fileAction(id, "chmod", "/renamed", 0o700);
  if (process.platform !== "win32")
    assert.equal(
      (await fs.stat(path.join(s.fixtureServer.root, "renamed"))).mode & 0o777,
      0o700,
    );
  await s.manager.fileAction(id, "remove", "/renamed");
  await assert.rejects(fs.stat(path.join(s.fixtureServer.root, "renamed")));
});
test("SFTP transfers real bytes, refuses overwrite and supports cancellation cleanup", async (t) => {
  const s = await setup(t),
    id = s.manager.open(s.host.id);
  await wait(() => s.events.find((e) => e.status === "ready"));
  const transfers = new Transfers(s.manager, (e) => s.events.push(e));
  t.after(() => transfers.cancelAll());
  const local = path.join(s.directory, "payload.bin"),
    payload = Buffer.alloc(256 * 1024, 42);
  await fs.writeFile(local, payload);
  const up = transfers.start({
    sessionId: id,
    direction: "upload",
    local,
    remote: "/payload.bin",
    size: payload.length,
  });
  await wait(() => s.events.find((e) => e.id === up && e.status === "done"));
  assert.deepEqual(
    await fs.readFile(path.join(s.fixtureServer.root, "payload.bin")),
    payload,
  );
  const downPath = path.join(s.directory, "download.bin"),
    down = transfers.start({
      sessionId: id,
      direction: "download",
      local: downPath,
      remote: "/payload.bin",
      size: payload.length,
    });
  await wait(() => s.events.find((e) => e.id === down && e.status === "done"));
  assert.deepEqual(await fs.readFile(downPath), payload);
  const overwrite = transfers.start({
    sessionId: id,
    direction: "download",
    local: downPath,
    remote: "/hello.txt",
    size: 10,
  });
  await wait(() =>
    s.events.find((e) => e.id === overwrite && e.status === "error"),
  );
  assert.deepEqual(await fs.readFile(downPath), payload);
  const cancel = transfers.start({
    sessionId: id,
    direction: "upload",
    local,
    remote: "/cancel.bin",
    size: payload.length,
  });
  transfers.cancel(cancel);
  await wait(() =>
    s.events.find((e) => e.id === cancel && e.status === "cancelled"),
  );
  await wait(() => !transfers.jobs.size);
  const names = await fs.readdir(s.fixtureServer.root);
  assert.ok(!names.some((n) => n.includes(".part")));
});
test("local tunnel forwards bytes on loopback and closes with session", async (t) => {
  const s = await setup(t),
    id = s.manager.open(s.host.id);
  await wait(() => s.events.find((e) => e.status === "ready"));
  const echo = net.createServer((socket) => socket.pipe(socket));
  await new Promise((r) => echo.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => echo.close(r)));
  const info = await s.manager.tunnel({
    sessionId: id,
    localPort: 0,
    targetHost: "127.0.0.1",
    targetPort: echo.address().port,
  });
  const socket = net.connect(info.localPort, "127.0.0.1");
  socket.write("tunnel-ok");
  const [chunk] = await once(socket, "data");
  assert.equal(chunk.toString(), "tunnel-ok");
  socket.destroy();
  s.manager.close(id);
  assert.equal(s.manager.tunnels.size, 0);
});
test("recursive folder upload/download preserves bytes and empty dirs; rejects existing destination and symlinks", async (t) => {
  const s = await setup(t),
    id = s.manager.open(s.host.id);
  await wait(() => s.events.find((e) => e.status === "ready"));
  const transfers = new Transfers(s.manager, (e) => s.events.push(e));
  t.after(() => transfers.cancelAll());
  const source = path.join(s.directory, "tree");
  await fs.mkdir(path.join(source, "nested", "empty"), { recursive: true });
  await fs.writeFile(
    path.join(source, "nested", "utf8.txt"),
    "Unicode transfer: 日本語 🇰🇬\n",
  );
  const upload = transfers.start({
    sessionId: id,
    direction: "upload",
    local: source,
    remote: "/tree",
    directory: true,
  });
  await wait(() =>
    s.events.find((e) => e.id === upload && e.status === "done"),
  );
  const dest = path.join(s.directory, "downloaded");
  const download = transfers.start({
    sessionId: id,
    direction: "download",
    local: dest,
    remote: "/tree",
    directory: true,
  });
  await wait(() =>
    s.events.find((e) => e.id === download && e.status === "done"),
  );
  assert.equal(
    await fs.readFile(path.join(dest, "nested", "utf8.txt"), "utf8"),
    "Unicode transfer: 日本語 🇰🇬\n",
  );
  assert.ok((await fs.stat(path.join(dest, "nested", "empty"))).isDirectory());
  const collision = transfers.start({
    sessionId: id,
    direction: "upload",
    local: source,
    remote: "/tree",
    directory: true,
  });
  await wait(() =>
    s.events.find((e) => e.id === collision && e.status === "error"),
  );
  await fs.symlink(
    s.directory,
    path.join(source, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const link = transfers.start({
    sessionId: id,
    direction: "upload",
    local: source,
    remote: "/symlink",
    directory: true,
  });
  await wait(() => s.events.find((e) => e.id === link && e.status === "error"));
  await assert.rejects(fs.stat(path.join(s.fixtureServer.root, "symlink")));
});

test("authentication failures retain details and a one-time password retry does not replace the saved secret", async (t) => {
  let prompts = 0;
  const s = await setup(t, {
    authenticate: async () => {
      prompts++;
      return "test-password";
    },
  });
  await s.vault.saveHost({ ...s.host, password: "wrong-saved-password" });
  const failed = s.manager.open(s.host.id);
  const closed = await wait(() =>
    s.events.find((e) => e.sessionId === failed && e.status === "closed"),
  );
  assert.equal(closed.code, "AUTH_FAILED");
  assert.equal(closed.details, "All configured authentication methods failed");
  assert.ok(closed.message.includes("server rejected"));
  assert.equal(prompts, 0);
  const retried = s.manager.open(s.host.id, { promptPassword: true });
  await wait(() =>
    s.events.find((e) => e.sessionId === retried && e.status === "ready"),
  );
  assert.equal(prompts, 1);
  assert.equal(s.vault.host(s.host.id).password, "wrong-saved-password");
  assert.throws(
    () => s.manager.open(s.host.id, { promptPassword: "yes" }),
    /Invalid response/,
  );
});

test("successful SSH identifies the remote release over a separate SFTP channel without blocking the shell", async (t) => {
  const s = await setup(t);
  await fs.mkdir(path.join(s.fixtureServer.root, "etc"));
  await fs.writeFile(
    path.join(s.fixtureServer.root, "etc", "os-release"),
    'ID=ubuntu\nPRETTY_NAME="Ubuntu 24.04 LTS"\nVERSION_ID="24.04"\nID_LIKE=debian\n',
  );
  const id = s.manager.open(s.host.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === id && e.status === "ready"),
  );
  await s.manager.shell(id);
  s.manager.input(id, "shell-remains-usable\r");
  await wait(() => s.events.find((e) => e.type === "host-system"));
  assert.equal(s.vault.host(s.host.id).system.id, "ubuntu");
  assert.ok(
    s.events.some(
      (e) => e.type === "data" && e.data.includes("shell-remains-usable"),
    ),
  );
  const userFiles = await s.manager.listFiles(id, "/");
  assert.ok(userFiles.files.some((file) => file.name === "hello.txt"));
});

test("system metadata cache failures never fail an authenticated SSH session", async (t) => {
  const s = await setup(t);
  await fs.mkdir(path.join(s.fixtureServer.root, "etc"));
  await fs.writeFile(
    path.join(s.fixtureServer.root, "etc", "os-release"),
    "ID=ubuntu\n",
  );
  s.vault.rememberSystem = async () => {
    throw new Error("Disk full");
  };
  const id = s.manager.open(s.host.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === id && e.status === "ready"),
  );
  await s.manager.shell(id);
  await s.manager.get(id).systemProbe;
  assert.equal(s.manager.get(id).status, "ready");
  assert.equal(
    s.events.some((e) => e.type === "error"),
    false,
  );
  await s.manager.shell(id);
});

test("OS probes cannot steal the only channel from a MaxSessions=1 terminal", async (t) => {
  const s = await setup(t, { fixtureOptions: { maxSessions: 1 } });
  const id = s.manager.open(s.host.id);
  await wait(() =>
    s.events.find((e) => e.sessionId === id && e.status === "ready"),
  );
  assert.equal(s.manager.get(id).systemProbe, undefined);
  await s.manager.shell(id);
  await s.manager.get(id).systemProbe;
  s.manager.input(id, "primary-channel-still-open\r");
  await wait(() =>
    s.events.find(
      (e) => e.type === "data" && e.data.includes("primary-channel-still-open"),
    ),
  );
  assert.equal(s.manager.get(id).status, "ready");
  assert.equal(
    s.events.some((e) => e.type === "error"),
    false,
  );
});

test("system error guard safely maps positive POSIX codes like EINTR without RangeError", () => {
  assert.doesNotThrow(() => util.getSystemErrorName(4));
  assert.equal(util.getSystemErrorName(4), util.getSystemErrorName(-4));
  if (process.platform !== "win32") {
    assert.equal(util.getSystemErrorName(4), "EINTR");
  }
});
