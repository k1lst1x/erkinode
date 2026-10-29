import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { Vault } from "../electron/vault.js";
const key = randomBytes(32);
const protector = {
  async encrypt(text) {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", key, iv),
      data = Buffer.concat([c.update(text, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), data]);
  },
  async decrypt(buffer) {
    const d = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
    d.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([d.update(buffer.subarray(28)), d.final()]).toString();
  },
};
const sample = {
  name: "Production",
  address: "example.com",
  username: "deploy",
  password: "secret-NEVER-PLAINTEXT",
};

test("vault encrypts at rest, redacts secrets, preserves secrets during edits and survives reload", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-vault-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "vault.json"),
    v = new Vault(file, protector);
  await v.load();
  const h = await v.saveHost(sample);
  assert.equal(h.hasPassword, true);
  assert.equal(h.password, undefined);
  const raw = await fs.readFile(file, "utf8");
  assert.ok(!raw.includes(sample.password));
  assert.ok(!raw.includes("example.com"));
  await v.saveHost({ ...h, name: "Renamed" });
  assert.equal(v.host(h.id).password, sample.password);
  const other = new Vault(file, protector);
  await other.load();
  assert.equal(other.host(h.id).name, "Renamed");
  if (process.platform !== "win32")
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
test("concurrent edits are serialized and persistence failures roll back", async (t) => {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "erkinode-concurrent-"),
  );
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const v = new Vault(path.join(folder, "vault.json"), protector);
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      v.saveHost({ ...sample, name: `host-${i}` }),
    ),
  );
  const reloaded = new Vault(v.file, protector);
  await reloaded.load();
  assert.equal(reloaded.data.hosts.length, 8);
  v.protector = {
    encrypt: async () => {
      throw new Error("Keychain unavailable");
    },
  };
  await assert.rejects(v.saveHost(sample), /Keychain/);
  assert.equal(v.data.hosts.length, 8);
});
test("portable backup authenticates ciphertext, validates password, restores all data", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-backup-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const v = new Vault(path.join(folder, "a"), protector);
  await v.saveHost(sample);
  await v.saveSnippet({ name: "status", command: "uptime" });
  assert.throws(() => v.backup("short"), /12/);
  const blob = v.backup("a-very-long-test-password");
  assert.ok(!blob.includes(sample.password));
  const other = new Vault(path.join(folder, "b"), protector);
  await assert.rejects(
    async () => other.restore(blob, "wrong-password"),
    /Incorrect password/,
  );
  await other.restore(blob, "a-very-long-test-password");
  assert.equal(other.data.hosts.length, 1);
  assert.equal(other.data.snippets.length, 1);
  const tampered = JSON.parse(blob);
  const bytes = Buffer.from(tampered.data, "base64");
  bytes[0] ^= 1;
  tampered.data = bytes.toString("base64");
  await assert.rejects(
    async () =>
      other.restore(JSON.stringify(tampered), "a-very-long-test-password"),
    /corrupted/,
  );
});
test("host schema rejects malformed input; clearSecret and deleting jump host are explicit", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-schema-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const v = new Vault(path.join(folder, "vault"), protector);
  assert.throws(() => v.saveHost({ ...sample, port: -1 }));
  assert.throws(() => v.saveHost({ ...sample, address: "host; touch bad" }));
  const a = await v.saveHost(sample),
    b = await v.saveHost({ ...sample, jumpId: a.id });
  await assert.rejects(v.saveHost({ ...a, jumpId: a.id }), /own jump host/);
  await v.saveHost({ ...a, clearSecret: true });
  assert.equal(v.host(a.id).password, undefined);
  await v.deleteHost(a.id);
  assert.equal(v.host(b.id).jumpId, "");
});
test("legacy address formats cannot lock users out of an existing vault", async (t) => {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "erkinode-legacy-host-"),
  );
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "vault.json"),
    original = new Vault(file, protector);
  const host = await original.saveHost(sample);
  original.data.hosts[0].address = "deploy@example.com:2222";
  await original.persist();

  const migrated = new Vault(file, protector);
  await migrated.load();
  assert.equal(migrated.host(host.id).address, "example.com");
  assert.equal(migrated.host(host.id).port, 2222);
  assert.equal(migrated.host(host.id).username, "deploy");

  migrated.data.hosts[0].address = "127.0.0.1вй";
  await migrated.persist();
  const recoverable = new Vault(file, protector);
  await recoverable.load();
  assert.equal(recoverable.host(host.id).address, "127.0.0.1вй");
  assert.throws(() => recoverable.saveHost(recoverable.host(host.id)));
});

test("language preferences survive reload, old vaults default to English, and partial settings preserve values", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-language-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "vault.json");
  const vault = new Vault(file, protector);
  await vault.load();
  await vault.settings({ fontSize: 18 });
  await vault.settings({ language: "ru" });
  assert.deepEqual(vault.snapshot().settings, { fontSize: 18, language: "ru" });
  const reloaded = new Vault(file, protector);
  await reloaded.load();
  assert.deepEqual(reloaded.snapshot().settings, {
    fontSize: 18,
    language: "ru",
  });
  await reloaded.settings({ fontSize: 16 });
  assert.equal(reloaded.snapshot().settings.language, "ru");
  await assert.rejects(
    reloaded.settings({ language: "unsupported" }),
    /Unsupported language/,
  );
  assert.equal(reloaded.snapshot().settings.language, "ru");
  delete reloaded.data.settings.language;
  await reloaded.persist();
  const legacy = new Vault(file, protector);
  await legacy.load();
  assert.deepEqual(legacy.snapshot().settings, {
    fontSize: 16,
    language: "en",
  });
});

test("detected systems are cached across reloads, cannot be forged by host edits and expire when connection identity changes", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-system-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "vault.json"),
    vault = new Vault(file, protector);
  const host = await vault.saveHost(sample);
  const system = {
    id: "ubuntu",
    family: "linux",
    name: "Ubuntu 24.04 LTS",
    version: "24.04",
    like: ["debian"],
    detectedAt: new Date().toISOString(),
  };
  assert.equal(await vault.rememberSystem(host.id, system, host), true);
  const loaded = new Vault(file, protector);
  await loaded.load();
  assert.equal(loaded.snapshot().hosts[0].system.id, "ubuntu");
  await loaded.saveHost({
    ...loaded.snapshot().hosts[0],
    system: { ...system, id: "windows" },
  });
  assert.equal(loaded.host(host.id).system.id, "ubuntu");
  await loaded.saveHost({
    ...loaded.snapshot().hosts[0],
    address: "another.example.com",
  });
  assert.equal(loaded.host(host.id).system, undefined);
  assert.equal(await loaded.rememberSystem(host.id, system, host), false);
  assert.equal(loaded.host(host.id).system, undefined);
  await loaded.deleteHost(host.id);
  assert.equal(await loaded.rememberSystem(host.id, system, host), false);
});

test("Kazakh language preference survives encrypted save and reload", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-kk-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "vault.json");
  const vault = new Vault(file, protector);
  await vault.settings({ language: "kk" });
  const loaded = new Vault(file, protector);
  await loaded.load();
  assert.equal(loaded.snapshot().settings.language, "kk");
  await loaded.settings({ fontSize: 18 });
  assert.equal(loaded.snapshot().settings.language, "kk");
});
