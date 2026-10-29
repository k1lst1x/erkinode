import { t } from "./i18n.js";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
const call = (sftp, method, ...args) =>
  new Promise((resolve, reject) =>
    sftp[method](...args, (e, data) => (e ? reject(e) : resolve(data))),
  );
const safeName = (name) =>
  typeof name === "string" &&
  name &&
  name !== "." &&
  name !== ".." &&
  !/[\/\\\0]/.test(name);

export class Transfers {
  constructor(connections, emit) {
    this.connections = connections;
    this.emit = emit;
    this.jobs = new Map();
    this.active = 0;
    this.waiting = [];
  }
  cancel(id) {
    this.jobs.get(id)?.controller.abort();
  }
  cancelAll() {
    for (const job of this.jobs.values()) job.controller.abort();
  }
  cancelSession(id) {
    for (const job of this.jobs.values())
      if (job.sessionId === id) job.controller.abort();
  }
  pump() {
    while (this.active < 2 && this.waiting.length) {
      this.active++;
      this.waiting.shift()();
    }
  }
  async slot(signal) {
    signal.throwIfAborted();
    await new Promise((resolve) => {
      this.waiting.push(resolve);
      this.pump();
    });
    if (signal.aborted) {
      this.release();
      signal.throwIfAborted();
    }
  }
  release() {
    this.active--;
    this.pump();
  }
  start({ sessionId, direction, local, remote, size, directory = false }) {
    const id = randomUUID(),
      controller = new AbortController();
    const job = { id, controller, sessionId };
    this.jobs.set(id, job);
    const report = (extra) =>
      this.emit({
        type: "transfer",
        id,
        sessionId,
        direction,
        name: path.basename(local),
        size: size || 0,
        ...extra,
      });
    report({ status: "queued", transferred: 0 });
    setImmediate(async () => {
      let sftp,
        occupied = false;
      let transferred = 0,
        last = 0,
        total = size || 0;
      const signal = controller.signal,
        check = () => signal.throwIfAborted(),
        plan = [];
      const add = (item) => {
        if (plan.length >= 20000)
          throw new Error(t("A transfer can contain up to 20,000 items"));
        plan.push(item);
      };
      const walk = async (from, to, depth = 0) => {
        check();
        if (depth > 64) throw new Error(t("Folder nesting is too deep"));
        const st =
          direction === "upload"
            ? await fsp.lstat(from)
            : await call(sftp, "lstat", from);
        if (st.isSymbolicLink())
          throw new Error(
            t(
              "Folder transfers do not follow symbolic links. Transfer the target separately.",
            ),
          );
        if (st.isDirectory()) {
          add({ directory: true, from, to });
          const entries =
            direction === "upload"
              ? (await fsp.readdir(from)).map((name) => ({ name }))
              : (await call(sftp, "readdir", from)).map((e) => ({
                  name: e.filename,
                }));
          for (const { name } of entries) {
            if (name === "." || name === "..") continue;
            if (!safeName(name))
              throw new Error(t("The server returned an unsafe file name"));
            await walk(
              direction === "upload"
                ? path.join(from, name)
                : path.posix.join(from, name),
              direction === "upload"
                ? path.posix.join(to, name)
                : path.join(to, name),
              depth + 1,
            );
          }
        } else if (st.isFile())
          add({ directory: false, from, to, size: st.size });
        else throw new Error(t("Only regular files and folders are supported"));
      };
      try {
        await this.slot(signal);
        occupied = true;
        sftp = await this.connections.sftp(sessionId);
        check();
        report({
          status: "running",
          transferred,
          message: directory ? t("Preparing file list…") : "",
        });
        if (directory) {
          await walk(
            direction === "upload" ? local : remote,
            direction === "upload" ? remote : local,
          );
          total = plan
            .filter((x) => !x.directory)
            .reduce((sum, x) => sum + x.size, 0);
        } else
          add({
            from: direction === "upload" ? local : remote,
            to: direction === "upload" ? remote : local,
            size,
            directory: false,
          });
        report({ status: "running", transferred, size: total });
        for (const item of plan) {
          check();
          if (item.directory) {
            if (direction === "upload")
              await call(sftp, "mkdir", item.to, { mode: 0o700 });
            else await fsp.mkdir(item.to, { mode: 0o700 });
            continue;
          }
          const temp = `${item.to}.erkinode-${id}.part`;
          try {
            const meter = new Transform({
              transform(chunk, _encoding, done) {
                transferred += chunk.length;
                const now = Date.now();
                if (now - last > 100) {
                  last = now;
                  report({ status: "running", transferred, size: total });
                }
                done(null, chunk);
              },
            });
            const source =
              direction === "upload"
                ? fs.createReadStream(item.from)
                : sftp.createReadStream(item.from);
            const dest =
              direction === "upload"
                ? sftp.createWriteStream(temp, { flags: "wx", mode: 0o600 })
                : fs.createWriteStream(temp, { flags: "wx", mode: 0o600 });
            await pipeline(source, meter, dest, { signal });
            check();
            if (direction === "upload") {
              await new Promise((resolve, reject) =>
                sftp.lstat(item.to, (e) =>
                  e?.code === 2
                    ? resolve()
                    : reject(
                        e ||
                          new Error(t("The file already exists on the server")),
                      ),
                ),
              );
              await call(sftp, "rename", temp, item.to);
            } else {
              await fsp.link(temp, item.to);
              await fsp.unlink(temp);
            }
          } finally {
            if (direction === "upload") {
              if (!sftp.destroyed)
                await call(sftp, "unlink", temp).catch(() => {});
            } else await fsp.unlink(temp).catch(() => {});
          }
        }
        report({ status: "done", transferred, size: total });
      } catch (e) {
        report({
          status: signal.aborted ? "cancelled" : "error",
          transferred,
          size: total,
          message: `${e.message}${directory ? " " + t("Files already transferred remain in the destination folder.") : ""}`,
        });
      } finally {
        this.jobs.delete(id);
        if (occupied) this.release();
      }
    });
    return id;
  }
}
