const { contextBridge, ipcRenderer } = require("electron");
const allowed = new Set([
  "state",
  "update:check",
  "update:open",
  "host:save",
  "host:delete",
  "key:import",
  "key:generate",
  "session:open",
  "local:open-terminal",
  "session:shell",
  "session:close",
  "session:input",
  "session:sudo-password",
  "session:sudo-password-dismiss",
  "session:resize",
  "sftp:list",
  "sftp:action",
  "sftp:read",
  "sftp:write",
  "transfer:upload",
  "transfer:download",
  "transfer:cancel",
  "snippet:save",
  "snippet:delete",
  "known:forget",
  "settings:save",
  "lock:status",
  "lock:unlock",
  "lock:setup",
  "lock:disable",
  "lock:idle",
  "lock:now",
  "clipboard:write-text",
  "clipboard:read-text",
  "clipboard:paste-native",
  "tunnel:start",
  "tunnel:stop",
  "backup:export",
  "backup:restore",
  "prompt:answer",
]);
for (const method of [
  "local:choose",
  "local:list",
  "transfer:upload-local",
  "transfer:download-local",
])
  allowed.add(method);
contextBridge.exposeInMainWorld("erkinode", {
  async invoke(method, args) {
    if (!allowed.has(method)) throw new Error("Access denied");
    const result = await ipcRenderer.invoke("erkinode:invoke", method, args);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
  onEvent(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("erkinode:event", listener);
    return () => ipcRenderer.removeListener("erkinode:event", listener);
  },
  ack(id, bytes) {
    ipcRenderer.send("erkinode:ack", id, bytes);
  },
});
