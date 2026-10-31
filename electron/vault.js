import { normalizeLanguage, languageCodes } from "../locales/runtime.js";
import { t } from "./i18n.js";
import fs from "node:fs/promises";
import path from "node:path";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
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

export const BACKUP_FORMAT = "erkinode-backup";
export const BACKUP_FORMAT_VERSION = 1;
const LEGACY_BACKUP_FORMATS = new Set([
  "erkinode-backup-v1",
  "harbor-backup-v1",
]);

function readBackupEnvelope(blob) {
  let backup;
  try {
    backup = JSON.parse(blob);
  } catch {
    throw new Error(t("The backup file is not valid JSON"));
  }
  if (!backup || typeof backup !== "object" || Array.isArray(backup))
    throw new Error(t("The backup file has an invalid structure"));
  const legacy = LEGACY_BACKUP_FORMATS.has(backup.format);
  if (
    !legacy &&
    (backup.format !== BACKUP_FORMAT ||
      backup.formatVersion !== BACKUP_FORMAT_VERSION)
  )
    throw new Error(t("This backup version is not supported"));
  if (
    !legacy &&
    (typeof backup.appVersion !== "string" ||
      backup.appVersion.length > 100 ||
      typeof backup.createdAt !== "string" ||
      !Number.isFinite(Date.parse(backup.createdAt)))
  )
    throw new Error(t("The backup file has an invalid structure"));
  for (const field of ["salt", "iv", "tag", "data"])
    if (
      typeof backup[field] !== "string" ||
      !backup[field] ||
      backup[field].length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        backup[field],
      )
    )
      throw new Error(t("The backup file has an invalid structure"));
  return { backup, legacy };
}

const backupMetadata = (backup) =>
  Buffer.from(
    JSON.stringify([
      backup.format,
      backup.formatVersion,
      backup.appVersion,
      backup.createdAt,
    ]),
    "utf8",
  );

function migrateBackupData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error(t("The backup contains invalid vault data"));
  // Add future migrations here in order, returning the current vault schema.
  if (data.version !== 1)
    throw new Error(t("This backup data version is not supported"));
  return structuredClone(data);
}

export class Vault {
  constructor(file, protector, { appVersion = "unknown" } = {}) {
    this.file = file;
    this.protector = protector;
    this.appVersion = appVersion;
    this.data = {
      version: 1,
      hosts: [],
      knownHosts: {},
      snippets: [],
      settings: {
        fontSize: 14,
        language: "en",
        pinLock: { enabled: false, idleMinutes: 0 },
      },
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
      pinLock:
        data.settings?.pinLock?.enabled &&
        typeof data.settings.pinLock.salt === "string" &&
        typeof data.settings.pinLock.hash === "string"
          ? {
              enabled: true,
              salt: data.settings.pinLock.salt,
              hash: data.settings.pinLock.hash,
              idleMinutes: [0, 5, 15, 30, 60].includes(
                Number(data.settings.pinLock.idleMinutes),
              )
                ? Number(data.settings.pinLock.idleMinutes)
                : 0,
            }
          : { enabled: false, idleMinutes: 0 },
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
    const { pinLock, ...settings } = this.data.settings;
    return {
      hosts: this.data.hosts.map(publicHost),
      snippets: this.data.snippets,
      knownHosts: this.data.knownHosts,
      settings: {
        ...settings,
        pinLock: {
          enabled: pinLock?.enabled === true,
          idleMinutes: Number(pinLock?.idleMinutes) || 0,
        },
      },
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
  pinEnabled() {
    return this.data.settings.pinLock?.enabled === true;
  }
  pinDigits() {
    return this.data.settings.pinLock?.digits || 6;
  }
  verifyPin(pin) {
    const lock = this.data.settings.pinLock;
    if (!lock?.enabled || !/^\d{4}$|^\d{6}$/.test(pin || "")) return false;
    const expected = Buffer.from(lock.hash, "base64");
    const actual = scryptSync(pin, Buffer.from(lock.salt, "base64"), 32);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
  setPin(pin, idleMinutes = 0) {
    if (!/^\d{4}$|^\d{6}$/.test(pin || ""))
      throw new Error(t("Enter a 4 or 6-digit PIN"));
    if (![0, 5, 15, 30, 60].includes(Number(idleMinutes)))
      throw new Error(t("Invalid settings"));
    return this.mutate(() => {
      const salt = randomBytes(16);
      this.data.settings.pinLock = {
        enabled: true,
        salt: salt.toString("base64"),
        hash: scryptSync(pin, salt, 32).toString("base64"),
        idleMinutes: Number(idleMinutes),
        digits: pin.length,
      };
    });
  }
  disablePin() {
    return this.mutate(() => {
      this.data.settings.pinLock = { enabled: false, idleMinutes: 0 };
    });
  }
  setPinIdleMinutes(value) {
    const idleMinutes = Number(value);
    if (![0, 5, 15, 30, 60].includes(idleMinutes))
      throw new Error(t("Invalid settings"));
    return this.mutate(() => {
      if (!this.pinEnabled()) throw new Error(t("PIN lock is not enabled"));
      this.data.settings.pinLock.idleMinutes = idleMinutes;
    });
  }
  backup(password) {
    if (typeof password !== "string" || password.length < 12)
      throw new Error(
        t("The backup password must contain at least 12 characters"),
      );
    const metadata = {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: this.appVersion,
        createdAt: new Date().toISOString(),
      },
      salt = randomBytes(16),
      iv = randomBytes(12),
      key = scryptSync(password, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(backupMetadata(metadata));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(this.data), "utf8"),
      cipher.final(),
    ]);
    key.fill(0);
    return JSON.stringify({
      ...metadata,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    });
  }
  restore(blob, password) {
    if (Buffer.byteLength(blob) > 16 * 1024 * 1024)
      throw new Error(t("The backup is too large"));
    const { backup: b, legacy } = readBackupEnvelope(blob);
    let data;
    try {
      const salt = Buffer.from(b.salt, "base64"),
        iv = Buffer.from(b.iv, "base64"),
        tag = Buffer.from(b.tag, "base64");
      if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16)
        throw new Error();
      const key = scryptSync(password, salt, 32),
        decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      if (!legacy) decipher.setAAD(backupMetadata(b));
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
    } catch {
      throw new Error(t("Incorrect password or corrupted backup"));
    }
    data = migrateBackupData(data);
    try {
      this.validate(data);
    } catch {
      throw new Error(t("The backup contains invalid vault data"));
    }
    return this.mutate(() => {
      this.data = data;
    });
  }
}
