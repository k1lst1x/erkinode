import { normalizeLanguage, languageCodes } from "../locales/runtime.js";
import { t } from "./i18n.js";
import fs from "node:fs/promises";
import path from "node:path";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  hostSchema,
  storedHostSchema,
  publicHost,
  snippetSchema,
  systemSchema,
} from "./schema.js";
import { parseConnectionTarget } from "../shared/connection-input.js";

export class Vault {
  constructor(file, protector) {
    this.file = file;
    this.protector = protector;
    this.data = {
      version: 1,
      hosts: [],
      knownHosts: {},
      snippets: [],
      settings: { fontSize: 14, language: "en" },
    };
    this.queue = Promise.resolve();
  }
  async load() {
    try {
      const blob = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (blob.version !== 1 || typeof blob.ciphertext !== "string")
        throw new Error(t("Unknown vault format"));
      const data = JSON.parse(
        await this.protector.decrypt(Buffer.from(blob.ciphertext, "base64")),
      );
      this.validate(data);
      this.data = data;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  validate(data) {
    if (
      data.version !== 1 ||
      !Array.isArray(data.hosts) ||
      !Array.isArray(data.snippets) ||
      !data.knownHosts ||
      typeof data.knownHosts !== "object"
    )
      throw new Error(t("Invalid vault"));
    data.hosts = data.hosts.map((host) => {
      const system = systemSchema.safeParse(host.system),
        stored = storedHostSchema.parse(host),
        target = parseConnectionTarget(stored.address),
        normalized = target.ok
          ? {
              ...stored,
              address: target.address,
              port: target.port ?? stored.port,
              username: target.username || stored.username,
            }
          : stored;
      return {
        ...normalized,
        id: host.id,
        ...(system.success ? { system: system.data } : {}),
      };
    });
    data.snippets = data.snippets.map((s) => snippetSchema.parse(s));
    if (data.hosts.some((h) => !h.id) || data.snippets.some((s) => !s.id))
      throw new Error(t("Missing ID"));
    for (const [key, value] of Object.entries(data.knownHosts))
      if (
        typeof value !== "string" ||
        !value.startsWith("SHA256:") ||
        key.length > 300
      )
        throw new Error(t("Invalid fingerprints"));
    data.settings = {
      language: normalizeLanguage(data.settings?.language),
      fontSize: Math.max(
        10,
        Math.min(24, Number(data.settings?.fontSize) || 14),
      ),
    };
  }
  mutate(fn) {
    const operation = this.queue.then(async () => {
      const previous = structuredClone(this.data);
      try {
        const result = await fn();
        await this.persist();
        return result;
      } catch (e) {
        this.data = previous;
        throw e;
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async persist() {
    const cipher = await this.protector.encrypt(JSON.stringify(this.data));
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(
        temp,
        JSON.stringify({ version: 1, ciphertext: cipher.toString("base64") }),
        { mode: 0o600, flag: "wx" },
      );
      await fs.rename(temp, this.file);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  snapshot() {
    return {
      hosts: this.data.hosts.map(publicHost),
      snippets: this.data.snippets,
      knownHosts: this.data.knownHosts,
      settings: this.data.settings,
    };
  }
  host(id) {
    const h = this.data.hosts.find((h) => h.id === id);
    if (!h) throw new Error(t("Host not found"));
    return structuredClone(h);
  }
  saveHost(input) {
    const parsed = hostSchema.parse(input);
    return this.mutate(() => {
      const old = parsed.id ? this.host(parsed.id) : {};
      const { clearSecret, ...next } = parsed;
      const host = { ...old, ...next, id: parsed.id || randomUUID() };
      if (
        ["address", "port", "username", "jumpId"].some(
          (key) => old[key] !== undefined && old[key] !== host[key],
        )
      )
        delete host.system;
      for (const key of ["password", "privateKey", "passphrase"]) {
        if (next[key] === undefined) host[key] = old[key];
        if (clearSecret) delete host[key];
      }
      if (host.jumpId === host.id)
        throw new Error(t("A host cannot be its own jump host"));
      if (host.jumpId && !this.data.hosts.some((h) => h.id === host.jumpId))
        throw new Error(t("Jump host not found"));
      this.data.hosts = [
        ...this.data.hosts.filter((h) => h.id !== host.id),
        host,
      ];
      return publicHost(host);
    });
  }
  rememberSystem(id, system, expected) {
    const parsed = systemSchema.parse(system);
    return this.mutate(() => {
      const host = this.data.hosts.find((host) => host.id === id);
      if (
        !host ||
        ["address", "port", "username", "jumpId"].some(
          (key) => host[key] !== expected[key],
        )
      )
        return false;
      host.system = parsed;
      return true;
    });
  }
  deleteHost(id) {
    return this.mutate(() => {
      this.host(id);
      this.data.hosts = this.data.hosts
        .filter((h) => h.id !== id)
        .map((h) => (h.jumpId === id ? { ...h, jumpId: "" } : h));
    });
  }
  trust(endpoint, fingerprint) {
    return this.mutate(() => {
      const current = this.data.knownHosts[endpoint];
      if (current && current !== fingerprint)
        throw new Error(t("The host key changed during confirmation"));
      this.data.knownHosts[endpoint] = fingerprint;
    });
  }
  forget(endpoint) {
    return this.mutate(() => {
      delete this.data.knownHosts[endpoint];
    });
  }
  saveSnippet(input) {
    const s = snippetSchema.parse(input);
    return this.mutate(() => {
      const next = { ...s, id: s.id || randomUUID() };
      this.data.snippets = [
        ...this.data.snippets.filter((x) => x.id !== next.id),
        next,
      ];
      return next;
    });
  }
  deleteSnippet(id) {
    return this.mutate(() => {
      this.data.snippets = this.data.snippets.filter((s) => s.id !== id);
    });
  }
  settings(input) {
    return this.mutate(() => {
      if (!input || typeof input !== "object")
        throw new Error(t("Invalid settings"));
      if (
        input.language !== undefined &&
        !languageCodes.includes(input.language)
      )
        throw new Error(t("Unsupported language"));
      this.data.settings = {
        ...this.data.settings,
        ...(input.language === undefined ? {} : { language: input.language }),
        ...(input.fontSize === undefined
          ? {}
          : {
              fontSize: Math.max(
                10,
                Math.min(24, Number(input.fontSize) || 14),
              ),
            }),
      };
    });
  }
  backup(password) {
    if (typeof password !== "string" || password.length < 12)
      throw new Error(
        t("The backup password must contain at least 12 characters"),
      );
    const salt = randomBytes(16),
      iv = randomBytes(12),
      key = scryptSync(password, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(this.data), "utf8"),
      cipher.final(),
    ]);
    key.fill(0);
    return JSON.stringify({
      format: "erkinode-backup-v1",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    });
  }
  restore(blob, password) {
    if (Buffer.byteLength(blob) > 16 * 1024 * 1024)
      throw new Error(t("The backup is too large"));
    let data;
    try {
      const b = JSON.parse(blob);
      if (b.format !== "erkinode-backup-v1") throw new Error();
      const salt = Buffer.from(b.salt, "base64"),
        iv = Buffer.from(b.iv, "base64"),
        tag = Buffer.from(b.tag, "base64");
      if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16)
        throw new Error();
      const key = scryptSync(password, salt, 32),
        decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      try {
        data = JSON.parse(
          Buffer.concat([
            decipher.update(Buffer.from(b.data, "base64")),
            decipher.final(),
          ]).toString("utf8"),
        );
      } finally {
        key.fill(0);
      }
      this.validate(data);
    } catch {
      throw new Error(t("Incorrect password or corrupted backup"));
    }
    return this.mutate(() => {
      this.data = data;
    });
  }
}
