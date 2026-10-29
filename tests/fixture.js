import ssh2 from "ssh2";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { generateKeyPairSync } from "node:crypto";
const { Server, utils } = ssh2;

export async function fixture(options = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "erkinode-sshd-"));
  await fsp.writeFile(
    path.join(root, "hello.txt"),
    "Hello 日本語, Erkinode!\n",
  );
  await fsp.mkdir(path.join(root, "documents"));
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const clients = new Set();
  const server = new Server({ hostKeys: [privateKey] }, (client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));
    client.on("error", () => {});
    client.on("authentication", (ctx) =>
      ctx.username === "tester" &&
      ctx.method === "password" &&
      ctx.password === "test-password"
        ? ctx.accept()
        : ctx.reject(),
    );
    client.on("ready", () => {
      client.on("tcpip", (accept, _reject, info) => {
        const channel = accept();
        const socket = net.connect(info.destPort, info.destIP);
        socket.on("error", () => channel.destroy());
        channel.on("error", () => socket.destroy());
        channel.on("close", () => socket.destroy());
        socket.pipe(channel).pipe(socket);
      });
      let activeSessions = 0;
      client.on("session", (accept, reject) => {
        if (activeSessions >= (options.maxSessions ?? Infinity))
          return reject();
        const session = accept();
        activeSessions++;
        session.once("close", () => activeSessions--);
        session.on("pty", (accept) => accept());
        session.on("window-change", (accept) => accept?.());
        session.on("shell", (accept) => {
          const stream = accept();
          stream.write("\x1b[32mErkinode integration SSH server\x1b[0m\r\n$ ");
          stream.on("data", (data) => stream.write(data));
          stream.on("error", () => {});
        });
        session.on("sftp", (accept) => serveSftp(accept(), root));
      });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    root,
    port: server.address().port,
    close: async () => {
      clients.forEach((c) => c.end());
      await new Promise((resolve) => server.close(resolve));
      await fsp.rm(root, { recursive: true, force: true });
    },
  };
}
function serveSftp(sftp, root) {
  const { STATUS_CODE, flagsToString } = utils.sftp,
    handles = new Map();
  let handleId = 1;
  const local = (file) => {
    const dest = path.resolve(root, `.${path.posix.resolve("/", file)}`);
    if (dest !== root && !dest.startsWith(root + path.sep))
      throw new Error("Bad path");
    return dest;
  };
  const attrs = (st) => ({
    mode: st.mode,
    uid: st.uid,
    gid: st.gid,
    size: st.size,
    atime: Math.floor(st.atimeMs / 1000),
    mtime: Math.floor(st.mtimeMs / 1000),
  });
  const fail = (id, error) =>
    sftp.status(
      id,
      error.code === "ENOENT" ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE,
      error.message,
    );
  const operation = (event, fn) =>
    sftp.on(event, (id, ...args) => {
      Promise.resolve()
        .then(() => fn(id, ...args))
        .catch((e) => fail(id, e));
    });
  operation("REALPATH", async (id, file) =>
    sftp.name(id, [
      { filename: path.posix.resolve("/", file), longname: "", attrs: {} },
    ]),
  );
  operation("STAT", async (id, file) =>
    sftp.attrs(id, attrs(await fsp.stat(local(file)))),
  );
  operation("LSTAT", async (id, file) =>
    sftp.attrs(id, attrs(await fsp.lstat(local(file)))),
  );
  operation("OPENDIR", async (id, file) => {
    const entries = await fsp.readdir(local(file));
    const h = Buffer.alloc(4);
    h.writeUInt32BE(handleId++);
    handles.set(h.toString("hex"), { directory: file, entries });
    sftp.handle(id, h);
  });
  operation("READDIR", async (id, handle) => {
    const h = handles.get(handle.toString("hex"));
    if (!h?.entries?.length) return sftp.status(id, STATUS_CODE.EOF);
    const entries = h.entries.splice(0);
    sftp.name(
      id,
      await Promise.all(
        entries.map(async (name) => ({
          filename: name,
          longname: name,
          attrs: attrs(
            await fsp.lstat(local(path.posix.join(h.directory, name))),
          ),
        })),
      ),
    );
  });
  operation("OPEN", async (id, file, flags, at) => {
    const h = Buffer.alloc(4);
    h.writeUInt32BE(handleId++);
    const fileHandle = await fsp.open(
      local(file),
      flagsToString(flags),
      at.mode || 0o600,
    );
    handles.set(h.toString("hex"), { fileHandle });
    sftp.handle(id, h);
  });
  operation("READ", async (id, handle, offset, length) => {
    const h = handles.get(handle.toString("hex"));
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await h.fileHandle.read(buffer, 0, length, offset);
    if (!bytesRead) return sftp.status(id, STATUS_CODE.EOF);
    sftp.data(id, buffer.subarray(0, bytesRead));
  });
  operation("WRITE", async (id, handle, offset, data) => {
    await handles
      .get(handle.toString("hex"))
      .fileHandle.write(data, 0, data.length, offset);
    sftp.status(id, STATUS_CODE.OK);
  });
  operation("FSTAT", async (id, handle) =>
    sftp.attrs(
      id,
      attrs(await handles.get(handle.toString("hex")).fileHandle.stat()),
    ),
  );
  operation("CLOSE", async (id, handle) => {
    const h = handles.get(handle.toString("hex"));
    await h?.fileHandle?.close();
    handles.delete(handle.toString("hex"));
    sftp.status(id, STATUS_CODE.OK);
  });
  for (const [event, method] of [
    ["REMOVE", "unlink"],
    ["RMDIR", "rmdir"],
    ["MKDIR", "mkdir"],
  ])
    operation(event, async (id, file) => {
      await fsp[method](local(file));
      sftp.status(id, STATUS_CODE.OK);
    });
  operation("RENAME", async (id, from, to) => {
    await fsp.rename(local(from), local(to));
    sftp.status(id, STATUS_CODE.OK);
  });
  operation("EXTENDED", async (id, name, data) => {
    if (name !== "posix-rename@openssh.com")
      return sftp.status(id, STATUS_CODE.OP_UNSUPPORTED);
    let offset = 0;
    const read = () => {
      const len = data.readUInt32BE(offset);
      offset += 4;
      const text = data.subarray(offset, offset + len).toString();
      offset += len;
      return text;
    };
    await fsp.rename(local(read()), local(read()));
    sftp.status(id, STATUS_CODE.OK);
  });
  operation("SETSTAT", async (id, file, at) => {
    if (at.mode !== undefined) await fsp.chmod(local(file), at.mode);
    sftp.status(id, STATUS_CODE.OK);
  });
  sftp.on("close", () => {
    for (const h of handles.values()) h.fileHandle?.close().catch(() => {});
    handles.clear();
  });
  sftp.on("error", () => {});
}
