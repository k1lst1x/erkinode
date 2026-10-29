import { t as translate, i18n } from "./i18n";
import { useEffect, useState } from "react";
import {
  ArrowUp,
  RefreshCw,
  Upload,
  Download,
  Folder,
  File,
  FileText,
  Pencil,
  Trash2,
  FolderPlus,
  Shield,
  X,
  Save,
} from "lucide-react";
import type { RemoteFile } from "./types";
import LocalPane from "./LocalPane";
const join = (base: string, name: string) =>
  `${base === "/" ? "" : base}/${name}`;
const bytes = (n: number) =>
  n < 1024
    ? `${n} ${translate("B")}`
    : n < 1048576
      ? `${(n / 1024).toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })} ${translate("KB")}`
      : `${(n / 1048576).toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })} ${translate("MB")}`;
export default function SftpView({
  id,
  visible,
  onError,
}: {
  id: string;
  visible: boolean;
  onError: (s: string) => void;
}) {
  const [directory, setDirectory] = useState("."),
    [input, setInput] = useState("."),
    [files, setFiles] = useState<RemoteFile[]>([]),
    [selected, select] = useState<RemoteFile | null>(null),
    [busy, setBusy] = useState(false),
    [hidden, setHidden] = useState(false);
  const [operation, setOperation] = useState<{
    type: string;
    value: string;
  } | null>(null);
  const [localDirectory, setLocalDirectory] = useState("");
  const [editor, setEditor] = useState<{
    path: string;
    text: string;
    revision: string;
    dirty: boolean;
  } | null>(null);
  async function load(dir = directory) {
    setBusy(true);
    try {
      const result = await window.erkinode.invoke<{
        path: string;
        files: RemoteFile[];
      }>("sftp:list", { id, path: dir });
      setDirectory(result.path);
      setInput(result.path);
      setFiles(result.files);
      select(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (visible) void load();
  }, [id, visible]);
  useEffect(
    () =>
      window.erkinode.onEvent((event) => {
        if (
          event.type === "transfer" &&
          event.sessionId === id &&
          event.status === "done" &&
          event.direction === "upload"
        )
          void load();
      }),
    [id, directory],
  );
  const filePath = selected ? join(directory, selected.name) : "";
  async function act(type: string, value?: string | number) {
    try {
      await window.erkinode.invoke("sftp:action", {
        id,
        action: type,
        path: type === "mkdir" ? join(directory, String(value)) : filePath,
        value: type === "rename" ? join(directory, String(value)) : value,
      });
      setOperation(null);
      await load();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  function safeName(name: string) {
    return (
      !!name &&
      name !== "." &&
      name !== ".." &&
      !name.includes("/") &&
      !name.includes("\0")
    );
  }
  async function edit() {
    if (!selected || selected.directory) return;
    try {
      const result = await window.erkinode.invoke<{
        text: string;
        revision: string;
      }>("sftp:read", { id, path: filePath });
      setEditor({ path: filePath, ...result, dirty: false });
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function save() {
    if (!editor) return;
    setBusy(true);
    try {
      const result = await window.erkinode.invoke<{ revision: string }>(
        "sftp:write",
        { id, ...editor },
      );
      setEditor({ ...editor, revision: result.revision, dirty: false });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sftp-layout">
      <LocalPane
        sessionId={id}
        remoteDirectory={directory}
        onPath={setLocalDirectory}
        onError={onError}
      />
      <div className="sftp-view">
        <div className="file-toolbar">
          <button
            title={translate("Parent folder")}
            onClick={() => void load(join(directory, ".."))}
          >
            <ArrowUp size={17} />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(input);
            }}
          >
            <input
              aria-label={translate("Remote path")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
            />
          </form>
          <button
            disabled={busy}
            title={translate("Refresh")}
            onClick={() => void load()}
          >
            <RefreshCw size={17} className={busy ? "spin" : ""} />
          </button>
          <button onClick={() => setOperation({ type: "mkdir", value: "" })}>
            <FolderPlus size={17} />
            {translate("Folder")}
          </button>
          <button
            className="primary small"
            onClick={() =>
              window.erkinode
                .invoke("transfer:upload", { id, directory })
                .catch((e) => onError(e.message))
            }
          >
            <Upload size={16} />
            {translate("Upload")}
          </button>
        </div>
        <div className="file-context">
          <span>
            {translate("SFTP")}
            <span className="muted">/</span> {directory}
          </span>
          <label>
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            {translate("Hidden files")}
          </label>
        </div>
        <div className="file-table">
          <table>
            <thead>
              <tr>
                <th>{translate("Name")}</th>
                <th>{translate("Size")}</th>
                <th>{translate("Permissions")}</th>
                <th>{translate("Modified")}</th>
              </tr>
            </thead>
            <tbody>
              {files
                .filter((f) => hidden || !f.name.startsWith("."))
                .sort(
                  (a, b) =>
                    Number(b.directory) - Number(a.directory) ||
                    a.name.localeCompare(b.name),
                )
                .map((f) => (
                  <tr
                    key={f.name}
                    className={selected?.name === f.name ? "selected" : ""}
                    onClick={() => select(f)}
                    onDoubleClick={() => {
                      if (f.directory || f.symlink)
                        void load(join(directory, f.name));
                      else {
                        select(f);
                      }
                    }}
                  >
                    <td>
                      {f.directory ? (
                        <Folder size={18} className="folder-icon" />
                      ) : (
                        <File size={18} />
                      )}
                      <span>
                        {f.name}
                        {f.symlink ? " ↗" : ""}
                      </span>
                    </td>
                    <td>{f.directory ? "—" : bytes(f.size)}</td>
                    <td>
                      <code>
                        {(f.mode & 0o777).toString(8).padStart(3, "0")}
                      </code>
                    </td>
                    <td>
                      {new Date(f.modified * 1000).toLocaleString(
                        i18n.resolvedLanguage || "en",
                        {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!busy && files.length === 0 && (
            <div className="file-empty">
              {translate("This folder is empty")}
            </div>
          )}
        </div>
        <div className="file-actions">
          <span className="muted">
            {selected?.name || translate("itemsCount", { count: files.length })}
          </span>
          <div>
            <button
              disabled={!selected || selected.symlink}
              onClick={() =>
                window.erkinode
                  .invoke(
                    localDirectory
                      ? "transfer:download-local"
                      : "transfer:download",
                    { id, path: filePath, localDirectory },
                  )
                  .catch((e) => onError(e.message))
              }
            >
              <Download size={16} />
              {localDirectory ? translate("← Download") : translate("Download")}
            </button>
            <button disabled={!selected || selected.directory} onClick={edit}>
              <FileText size={16} />
              {translate("Editor")}
            </button>
            <button
              disabled={!selected}
              onClick={() =>
                setOperation({ type: "rename", value: selected!.name })
              }
              title={translate("Rename")}
            >
              <Pencil size={16} />
            </button>
            <button
              disabled={!selected}
              onClick={() =>
                setOperation({
                  type: "chmod",
                  value: (selected!.mode & 0o777).toString(8),
                })
              }
              title={translate("Permissions")}
            >
              <Shield size={16} />
            </button>
            <button
              className="danger-icon"
              disabled={!selected}
              onClick={() => void act("remove")}
              title={translate("Delete")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {operation && (
          <div className="overlay">
            <form
              className="dialog compact"
              onSubmit={(e) => {
                e.preventDefault();
                if (operation.type === "chmod") {
                  if (!/^[0-7]{3}$/.test(operation.value))
                    return onError(
                      translate(
                        "Enter permissions in octal format, for example 755",
                      ),
                    );
                  void act("chmod", parseInt(operation.value, 8));
                } else if (safeName(operation.value))
                  void act(operation.type, operation.value);
                else onError(translate("Enter a name without slashes"));
              }}
            >
              <h2>
                {operation.type === "mkdir"
                  ? translate("New folder")
                  : operation.type === "rename"
                    ? translate("Rename")
                    : translate("Permissions")}
              </h2>
              <input
                autoFocus
                aria-label={translate("New value")}
                required
                value={operation.value}
                onChange={(e) =>
                  setOperation({ ...operation, value: e.target.value })
                }
              />
              <footer>
                <button type="button" onClick={() => setOperation(null)}>
                  {translate("Cancel")}
                </button>
                <button className="primary" type="submit">
                  {translate("Apply")}
                </button>
              </footer>
            </form>
          </div>
        )}
        {editor && (
          <div className="overlay editor-overlay">
            <div className="dialog editor">
              <header>
                <div>
                  <h2>
                    {editor.path.split("/").pop()}
                    {editor.dirty ? " •" : ""}
                  </h2>
                  <p>{editor.path}</p>
                </div>
                <button
                  title={translate("Close editor")}
                  onClick={() => {
                    if (
                      !editor.dirty ||
                      window.confirm(translate("Discard unsaved changes?"))
                    )
                      setEditor(null);
                  }}
                >
                  <X size={18} />
                </button>
              </header>
              <textarea
                aria-label={translate("File contents")}
                spellCheck={false}
                value={editor.text}
                onChange={(e) =>
                  setEditor({ ...editor, text: e.target.value, dirty: true })
                }
              />
              <footer>
                <span className="muted">
                  {translate(
                    "UTF-8 · up to 1 MB · checked for conflicts before saving",
                  )}
                </span>
                <button
                  disabled={busy || !editor.dirty}
                  className="primary"
                  onClick={save}
                >
                  <Save size={16} />
                  {translate("Save to server")}
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
