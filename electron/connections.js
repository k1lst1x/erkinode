import "./system-errors.js";
import { detectRemoteSystem } from "./remote-system.js";
import { t } from "./i18n.js";
import ssh2 from "ssh2";
import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import { StringDecoder } from "node:string_decoder";
import { remotePath, tunnelSchema } from "./schema.js";
import { describeConnectionFailure } from "../shared/connection-errors.js";
const { Client, utils } = ssh2;

export const fingerprint = (key) =>
  `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
export const endpoint = (h) => `[${h.address.toLowerCase()}]:${h.port}`;
export const describeFailure = (error, host) =>
  describeConnectionFailure(error, host, t);
const invoke = (obj, method, ...args) =>
  new Promise((resolve, reject) =>
    obj[method](...args, (e, result) => (e ? reject(e) : resolve(result))),
  );

export class Connections {
  constructor(
    vault,
    {
      emit = () => {},
      verify = async () => false,
      authenticate = async () => "",
      challenge = async () => null,
    } = {},
  ) {
    this.vault = vault;
    this.emit = emit;
    this.verify = verify;
    this.authenticate = authenticate;
    this.challenge = challenge;
    this.sessions = new Map();
    this.tunnels = new Map();
  }
  list() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      hostId: s.host.id,
      name: s.host.name,
      status: s.status,
    }));
  }
  async dial(host, session, visited = new Set()) {
    if (visited.has(host.id) || visited.size > 7)
      throw new Error(t("Jump host cycle or chain too long"));
    visited.add(host.id);
    let sock;
    if (host.jumpId) {
      const jump = await this.dial(
        this.vault.host(host.jumpId),
        session,
        visited,
      );
      sock = await invoke(
        jump,
        "forwardOut",
        "127.0.0.1",
        0,
        host.address,
        host.port,
      );
    }
    if (session.closed) throw new Error(t("Connection canceled"));
    const client = new Client();
    session.clients.push(client);
    let password = host.password;
    if (host.auth === "password" && !password) {
      password = await this.authenticate(host);
      if (password === null) throw new Error(t("Password entry canceled"));
    }
    let passphrase = host.passphrase;
    if (host.auth === "agent" && !process.env.SSH_AUTH_SOCK)
      throw new Error(
        t(
          "SSH agent unavailable. Start ssh-agent/ssh-add or use private key authentication.",
        ),
      );
    if (host.auth === "key") {
      if (!host.privateKey)
        throw new Error(t("Add a private key in host settings"));
      let parsed = utils.parseKey(host.privateKey, passphrase);
      if (
        parsed instanceof Error &&
        /encrypted|passphrase/i.test(parsed.message) &&
        !passphrase
      ) {
        const answers = await this.challenge(
          host,
          t("Encrypted SSH key"),
          t("Enter the key passphrase. It is used only for this connection."),
          [{ prompt: t("Passphrase"), echo: false }],
        );
        if (!answers) throw new Error(t("Passphrase entry canceled"));
        passphrase = answers[0];
        parsed = utils.parseKey(host.privateKey, passphrase);
      }
      if (parsed instanceof Error)
        throw new Error(
          t("Could not read SSH key: {{error}}", { error: parsed.message }),
        );
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        const failure =
          session.connectionFailure || describeFailure(error, host);
        if (!settled) {
          settled = true;
          const wrapped = new Error(failure.message);
          wrapped.code = failure.code;
          wrapped.details = failure.details;
          wrapped.erkinodeFailure = failure;
          reject(wrapped);
        } else if (!session.closed)
          this.emit({
            type: "error",
            sessionId: session.id,
            ...failure,
          });
      };
      client.on("error", fail).once("ready", () => {
        settled = true;
        resolve(client);
      });
      client.once("close", () => {
        if (!settled) fail(new Error(t("SSH connection closed")));
      });
      client.on(
        "keyboard-interactive",
        async (name, instructions, _lang, prompts, finish) => {
          try {
            const answers = await this.challenge(
              host,
              name,
              instructions,
              prompts,
            );
            finish(answers || []);
          } catch {
            finish([]);
          }
        },
      );
      try {
        client.connect({
          host: host.address,
          port: host.port,
          sock,
          username: host.username,
          ...(host.auth === "password"
            ? { password }
            : host.auth === "key"
              ? { privateKey: host.privateKey, passphrase }
              : { agent: process.env.SSH_AUTH_SOCK }),
          tryKeyboard: true,
          readyTimeout: 120000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 3,
          hostVerifier: (key, done) => {
            const fp = fingerprint(key),
              address = endpoint(host),
              known = this.vault.data.knownHosts[address];
            if (known === fp) return done(true);
            if (known) {
              session.connectionFailure = {
                code: "HOST_KEY_CHANGED",
                message: t(
                  "The host key for {{address}} has changed. Connection blocked. Verify the fingerprint with your administrator. New fingerprint: {{fingerprint}}",
                  { address, fingerprint: fp },
                ),
                details: `Expected ${known}\nReceived ${fp}`,
              };
              return done(false);
            }
            this.verify(host, fp)
              .then(async (accepted) => {
                if (!accepted || session.closed) {
                  if (!session.closed)
                    session.connectionFailure = {
                      code: "HOST_KEY_NOT_TRUSTED",
                      message: t(
                        "The host key was not trusted. Verify the fingerprint before connecting.",
                      ),
                      details: fp,
                    };
                  return done(false);
                }
                await this.vault.trust(address, fp);
                done(true);
              })
              .catch(() => done(false));
          },
        });
      } catch (e) {
        fail(e);
      }
    });
  }
  open(hostId, dimensions = {}, requestedId) {
    const host = this.vault.host(hostId),
      id = requestedId || randomUUID();
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      this.sessions.has(id)
    )
      throw new Error(t("Invalid response"));
    if (
      dimensions.promptPassword !== undefined &&
      typeof dimensions.promptPassword !== "boolean"
    )
      throw new Error(t("Invalid response"));
    if (dimensions.promptPassword && host.auth === "password")
      delete host.password;
    if (this.sessions.size >= 24)
      throw new Error(t("Up to 24 simultaneous connections are supported"));
    const session = {
      id,
      host,
      status: "connecting",
      clients: [],
      closed: false,
      stream: null,
      sftp: null,
      pending: 0,
      dimensions,
    };
    this.sessions.set(id, session);
    setImmediate(async () => {
      try {
        const client = await this.dial(host, session);
        if (session.closed) return client.end();
        session.client = client;
        session.status = "ready";
        client.once("close", () => this.close(id));
        this.emit({ type: "status", sessionId: id, status: "ready" });
      } catch (e) {
        const failure = describeFailure(e, host);
        this.emit({ type: "error", sessionId: id, ...failure });
        this.close(id, failure);
      }
    });
    return id;
  }
  startSystemProbe(session) {
    if (session.closed || session.systemProbe) return;
    const { client, host, id } = session;
    session.systemAbort = new AbortController();
    session.systemProbe = detectRemoteSystem(client, {
      signal: session.systemAbort.signal,
    })
      .then(async (system) => {
        if (!system || session.closed) return;
        const remembered = await this.vault.rememberSystem(
          host.id,
          { ...system, detectedAt: new Date().toISOString() },
          host,
        );
        if (remembered && !session.closed)
          this.emit({
            type: "host-system",
            sessionId: id,
            hostId: host.id,
          });
      })
      .catch(() => {}); // Optional metadata must never prevent SSH/SFTP use.
  }
  get(id) {
    const s = this.sessions.get(id);
    if (!s || s.closed) throw new Error(t("Connection closed"));
    return s;
  }
  ready(id) {
    const s = this.get(id);
    if (s.status !== "ready") throw new Error(t("Wait for the SSH connection"));
    return s;
  }
  async shell(id, dimensions = {}) {
    const s = this.ready(id);
    if (s.stream) return;
    if (s.openingShell) return s.openingShell;
    s.openingShell = (async () => {
      const stream = await invoke(s.client, "shell", {
        term: "xterm-256color",
        cols: Math.max(20, Math.min(400, dimensions.cols || 100)),
        rows: Math.max(5, Math.min(200, dimensions.rows || 30)),
      });
      if (s.closed) return stream.close();
      s.stream = stream;
      const decoder = new StringDecoder("utf8");
      const output = (chunk) => {
        const data = decoder.write(chunk);
        s.pending += Buffer.byteLength(data);
        if (s.pending > 256 * 1024) stream.pause();
        this.emit({
          type: "data",
          sessionId: id,
          data,
          bytes: Buffer.byteLength(data),
        });
      };
      stream.on("data", output);
      stream.stderr.on("data", output);
      stream.once("close", () => {
        const tail = decoder.end();
        if (tail)
          this.emit({
            type: "data",
            sessionId: id,
            data: tail,
            bytes: Buffer.byteLength(tail),
          });
        s.stream = null;
        this.emit({ type: "shell-closed", sessionId: id });
      });
      stream.on("error", (e) =>
        this.emit({ type: "error", sessionId: id, message: e.message }),
      );
      this.startSystemProbe(s);
    })();
    try {
      await s.openingShell;
    } finally {
      s.openingShell = null;
    }
  }
  input(id, data) {
    const s = this.ready(id);
    if (typeof data !== "string" || Buffer.byteLength(data) > 65536)
      throw new Error(t("Input is too large"));
    if (!s.stream) throw new Error(t("Terminal is not open yet"));
    s.stream.write(data);
  }
  ack(id, bytes) {
    const s = this.sessions.get(id);
    if (!s) return;
    s.pending = Math.max(
      0,
      s.pending - Math.max(0, Math.min(65536, Number(bytes) || 0)),
    );
    if (s.pending < 64 * 1024) s.stream?.resume();
  }
  resize(id, cols, rows) {
    const s = this.get(id);
    if (
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols >= 20 &&
      cols <= 400 &&
      rows >= 5 &&
      rows <= 200
    )
      s.stream?.setWindow(rows, cols, 0, 0);
  }
  async sftp(id) {
    const s = this.ready(id);
    if (!s.sftp) {
      s.sftp = invoke(s.client, "sftp").catch((e) => {
        s.sftp = null;
        throw e;
      });
    }
    const channel = await s.sftp;
    this.startSystemProbe(s);
    return channel;
  }
  async listFiles(id, directory) {
    const sftp = await this.sftp(id),
      absolute = await invoke(sftp, "realpath", remotePath.parse(directory));
    const files = await invoke(sftp, "readdir", absolute);
    return {
      path: absolute,
      files: files
        .filter((f) => f.filename !== "." && f.filename !== "..")
        .map((f) => ({
          name: f.filename,
          size: f.attrs.size,
          mode: f.attrs.mode,
          modified: f.attrs.mtime,
          directory: f.attrs.isDirectory(),
          symlink: f.attrs.isSymbolicLink(),
        })),
    };
  }
  async fileAction(id, action, file, value) {
    const sftp = await this.sftp(id);
    remotePath.parse(file);
    if (action === "mkdir") return invoke(sftp, "mkdir", file);
    if (action === "rename")
      return invoke(sftp, "rename", file, remotePath.parse(value));
    if (action === "chmod") {
      if (!Number.isInteger(value) || value < 0 || value > 0o777)
        throw new Error(t("Invalid permissions"));
      return invoke(sftp, "chmod", file, value);
    }
    if (action === "remove") {
      const st = await invoke(sftp, "lstat", file);
      return invoke(sftp, st.isDirectory() ? "rmdir" : "unlink", file);
    }
    throw new Error(t("Unknown operation"));
  }
  async readText(id, file) {
    const sftp = await this.sftp(id);
    remotePath.parse(file);
    const st = await invoke(sftp, "stat", file);
    if (st.size > 1024 * 1024 || st.isDirectory())
      throw new Error(t("The editor supports text files up to 1 MB"));
    const chunks = [];
    let size = 0;
    for await (const chunk of sftp.createReadStream(file)) {
      size += chunk.length;
      if (size > 1024 * 1024) throw new Error(t("The file is too large"));
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.includes(0)) throw new Error(t("This is not a text file"));
    return {
      text: buffer.toString("utf8"),
      revision: createHash("sha256").update(buffer).digest("hex"),
    };
  }
  async writeText(id, file, text, revision) {
    if (typeof text !== "string" || Buffer.byteLength(text) > 1024 * 1024)
      throw new Error(t("The file is too large"));
    const current = await this.readText(id, file);
    if (current.revision !== revision)
      throw new Error(
        t("The file changed on the server. Reopen it before saving."),
      );
    const sftp = await this.sftp(id),
      st = await invoke(sftp, "stat", file);
    const temp = `${file}.erkinode-${randomUUID()}.tmp`;
    try {
      await new Promise((resolve, reject) => {
        const stream = sftp.createWriteStream(temp, {
          flags: "wx",
          mode: st.mode & 0o777,
        });
        stream.on("error", reject).on("close", resolve);
        stream.end(text);
      });
      // OpenSSH POSIX rename provides atomic replacement. No truncate-in-place fallback.
      await invoke(sftp, "ext_openssh_rename", temp, file);
      return { revision: createHash("sha256").update(text).digest("hex") };
    } finally {
      await invoke(sftp, "unlink", temp).catch(() => {});
    }
  }
  async tunnel(input) {
    const rule = tunnelSchema.parse(input),
      s = this.ready(rule.sessionId),
      id = randomUUID();
    const sockets = new Set();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      s.client.forwardOut(
        "127.0.0.1",
        socket.remotePort || 0,
        rule.targetHost,
        rule.targetPort,
        (err, channel) => {
          if (err) {
            socket.destroy();
            this.emit({
              type: "error",
              sessionId: s.id,
              message: t("Tunnel: {{error}}", { error: err.message }),
            });
            return;
          }
          channel.on("error", () => socket.destroy());
          socket.on("close", () => channel.destroy());
          channel.on("close", () => socket.destroy());
          socket.pipe(channel).pipe(socket);
        },
      );
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(rule.localPort, "127.0.0.1", resolve);
    });
    server.on("error", (e) =>
      this.emit({ type: "error", sessionId: s.id, message: e.message }),
    );
    if (s.closed) {
      server.close();
      throw new Error(t("Connection closed"));
    }
    const info = { id, ...rule, localPort: server.address().port };
    this.tunnels.set(id, { info, server, sockets });
    return info;
  }
  stopTunnel(id) {
    const t = this.tunnels.get(id);
    if (t) {
      t.sockets.forEach((s) => s.destroy());
      t.server.close();
      this.tunnels.delete(id);
    }
  }
  close(id, failure = {}) {
    const s = this.sessions.get(id);
    if (!s) return;
    s.closed = true;
    s.systemAbort?.abort();
    for (const [tid, t] of this.tunnels)
      if (t.info.sessionId === id) this.stopTunnel(tid);
    s.stream?.destroy();
    [...s.clients].reverse().forEach((c) => c.destroy());
    this.sessions.delete(id);
    this.emit({ type: "status", sessionId: id, status: "closed", ...failure });
  }
  closeAll() {
    [...this.sessions.keys()].forEach((id) => this.close(id));
  }
}
