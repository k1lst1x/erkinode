import { t as translate } from "./i18n";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Folder,
  File,
  ArrowUp,
  RefreshCw,
  Upload,
  Laptop,
} from "lucide-react";
import type { RemoteFile } from "./types";
type Listing = { path: string; root: string; files: RemoteFile[] };
export default function LocalPane({
  sessionId,
  remoteDirectory,
  onPath,
  onError,
}: {
  sessionId: string;
  remoteDirectory: string;
  onPath: (s: string) => void;
  onError: (s: string) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null),
    [selected, select] = useState<RemoteFile | null>(null),
    [busy, setBusy] = useState(false);
  async function choose() {
    try {
      const data = await window.erkinode.invoke<Listing | null>("local:choose");
      if (data) {
        setListing(data);
        select(null);
        onPath(data.path);
      }
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function load(directory: string) {
    setBusy(true);
    try {
      const data = await window.erkinode.invoke<Listing>(
        "local:list",
        directory,
      );
      setListing(data);
      select(null);
      onPath(data.path);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(
    () =>
      window.erkinode.onEvent((e) => {
        if (
          e.type === "transfer" &&
          e.sessionId === sessionId &&
          e.direction === "download" &&
          e.status === "done" &&
          listing
        )
          void load(listing.path);
      }),
    [sessionId, listing?.path],
  );
  return (
    <div className="local-pane">
      <div className="local-pane-heading">
        <Laptop size={15} />
        <span>{translate("This computer")}</span>
        <button title={translate("Choose local folder")} onClick={choose}>
          <FolderOpen size={16} />
        </button>
      </div>
      {listing ? (
        <>
          <div className="local-path">
            <button
              title={translate("Parent local folder")}
              disabled={listing.path === listing.root}
              onClick={() => void load(`${listing.path}/..`)}
            >
              <ArrowUp size={15} />
            </button>
            <span title={listing.path}>
              {listing.path.split("/").pop() || listing.path}
            </span>
            <button
              title={translate("Refresh local folder")}
              disabled={busy}
              onClick={() => void load(listing.path)}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="local-files">
            {listing.files
              .filter((f) => !f.name.startsWith("."))
              .sort(
                (a, b) =>
                  Number(b.directory) - Number(a.directory) ||
                  a.name.localeCompare(b.name),
              )
              .map((f) => (
                <button
                  className={selected?.name === f.name ? "selected" : ""}
                  key={f.name}
                  disabled={f.symlink}
                  onClick={() => select(f)}
                  onDoubleClick={() => {
                    if (f.directory) void load(`${listing.path}/${f.name}`);
                  }}
                  title={
                    f.symlink
                      ? translate("Symbolic links cannot be transferred")
                      : f.name
                  }
                >
                  {f.directory ? <Folder size={16} /> : <File size={16} />}
                  <span>
                    {f.name}
                    {f.symlink ? " ↗" : ""}
                  </span>
                  {!f.directory && (
                    <small>
                      {f.size < 1024
                        ? `${f.size} ${translate("B")}`
                        : `${Math.round(f.size / 1024)} ${translate("KB")}`}
                    </small>
                  )}
                </button>
              ))}
            {!listing.files.length && (
              <p>{translate("This folder is empty")}</p>
            )}
          </div>
          <div className="local-upload">
            <button
              disabled={!selected || selected.symlink}
              onClick={() => {
                if (selected)
                  window.erkinode
                    .invoke("transfer:upload-local", {
                      id: sessionId,
                      local: `${listing.path}/${selected.name}`,
                      directory: remoteDirectory,
                    })
                    .catch((e) => onError(e.message));
              }}
            >
              <Upload size={14} />
              {translate("Upload →")}
            </button>
          </div>
        </>
      ) : (
        <div className="local-choose">
          <FolderOpen size={30} />
          <p>
            {translate("Choose a local folder to transfer files and folders.")}
          </p>
          <button onClick={choose}>{translate("Choose folder")}</button>
          <small>
            {translate("Erkinode can only access the selected folder.")}
          </small>
        </div>
      )}
    </div>
  );
}
