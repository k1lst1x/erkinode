import SystemIcon from "./SystemIcon";
import { version as appVersion } from "../package.json";
import { useTranslation } from "react-i18next";
import { t as translate, primaryModifier, i18n, languages } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  Server,
  Monitor,
  Search,
  Plus,
  Star,
  Folder,
  Terminal,
  Files,
  KeyRound,
  Code2,
  Settings,
  ArrowUpRight,
  ChevronRight,
  X,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  ShieldCheck,
  Cable,
  Download,
  Upload,
  Check,
  AlertCircle,
  Columns2,
  Play,
  LockKeyhole,
  Circle,
  ArrowLeft,
  Ellipsis,
} from "lucide-react";
import type {
  AppState,
  ErkinodeEvent,
  Host,
  Prompt,
  Session,
  Snippet,
  Transfer,
  UpdateInfo,
} from "./types";
import HostDialog from "./HostDialog";
import PromptDialog from "./PromptDialog";
import TerminalView from "./TerminalView";
import SftpView from "./SftpView";
import BrandMark from "./BrandMark";

const initial: AppState = {
  hosts: [],
  snippets: [],
  knownHosts: {},
  settings: {
    fontSize: 14,
    language: "en",
    pinLock: { enabled: false, idleMinutes: 0 },
  },
  sessions: [],
  version: "",
  platform: "",
};
const connectionErrorTitles: Record<string, string> = {
  DNS_NOT_FOUND: "Server address not found",
  DNS_TEMPORARY: "DNS lookup failed",
  CONNECTION_REFUSED: "SSH connection refused",
  CONNECTION_TIMEOUT: "Connection timed out",
  NETWORK_UNREACHABLE: "Server is unreachable",
  CONNECTION_RESET: "Connection interrupted",
  AUTH_FAILED: "Authentication failed",
  HOST_KEY_CHANGED: "Host key changed",
  HOST_KEY_NOT_TRUSTED: "Host key not trusted",
  SSH_INCOMPATIBLE: "SSH negotiation failed",
  INVALID_KEY: "Private key could not be used",
  AGENT_UNAVAILABLE: "SSH agent unavailable",
  CONNECTION_CLOSED: "Connection closed",
};
const editableConnectionErrors = new Set([
  "DNS_NOT_FOUND",
  "DNS_TEMPORARY",
  "CONNECTION_REFUSED",
  "CONNECTION_TIMEOUT",
  "NETWORK_UNREACHABLE",
  "SSH_INCOMPATIBLE",
  "INVALID_KEY",
  "AGENT_UNAVAILABLE",
  "UNKNOWN_CONNECTION_ERROR",
  "CONFIGURATION_ERROR",
]);
export default function App() {
  useTranslation();
  const [state, setState] = useState(initial),
    [page, setPage] = useState("hosts"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [layout, setLayout] = useState("grid");
  const [hostDialog, setHostDialog] = useState<Host | null | undefined>(
      undefined,
    ),
    [sessions, setSessions] = useState<Session[]>([]),
    [active, setActive] = useState(""),
    [split, setSplit] = useState(false),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [showTransfers, setShowTransfers] = useState(false);
  const [toast, setToast] = useState(""),
    [prompts, setPrompts] = useState<Prompt[]>([]),
    [snippetDialog, setSnippetDialog] = useState<Partial<Snippet> | null>(null),
    [tunnelDialog, setTunnelDialog] = useState(false);
  const [tunnels, setTunnels] = useState<
      {
        id: string;
        sessionId: string;
        localPort: number;
        targetHost: string;
        targetPort: number;
      }[]
    >([]),
    [backup, setBackup] = useState<"export" | "restore" | null>(null),
    [backupPassword, setBackupPassword] = useState(""),
    [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null),
    [updateDismissed, setUpdateDismissed] = useState(false),
    [checkingUpdate, setCheckingUpdate] = useState(false);
  const [lockStatus, setLockStatus] = useState<{
      enabled: boolean;
      locked: boolean;
      retryAfter: number;
      idleMinutes: number;
      digits?: number;
    } | null>(null),
    [pinEntry, setPinEntry] = useState(""),
    [pinError, setPinError] = useState(""),
    [pinDialog, setPinDialog] = useState<"enable" | "disable" | "idle" | null>(
      null,
    ),
    [pinConfirm, setPinConfirm] = useState(""),
    [pinIdleMinutes, setPinIdleMinutes] = useState(0),
    [pinDigits, setPinDigits] = useState<4 | 6>(6);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 8000);
  };
  async function refresh() {
    try {
      const snapshot = await window.erkinode.invoke<AppState>("state");
      await i18n.changeLanguage(snapshot.settings.language || "en");
      document.documentElement.lang = i18n.resolvedLanguage || "en";
      setState(snapshot);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function checkUpdate(showResult = false) {
    setCheckingUpdate(true);
    try {
      const result = await window.erkinode.invoke<UpdateInfo>("update:check");
      setUpdateInfo(result);
      setUpdateDismissed(false);
      if (showResult && !result.available)
        notify(translate("Erkinode is up to date."));
    } catch {
      if (showResult)
        notify(translate("Could not check for updates. Try again later."));
    } finally {
      setCheckingUpdate(false);
    }
  }
  useEffect(() => {
    if (!window.erkinode) {
      notify(
        translate(
          "Open Erkinode as a desktop app. Browsers do not support direct SSH connections.",
        ),
      );
      return;
    }
    window.erkinode
      .invoke("lock:status")
      .then((status) => {
        setLockStatus(status);
        if (!status.locked) {
          void refresh();
          void checkUpdate();
        }
      })
      .catch((error) => notify(error.message));
    return window.erkinode.onEvent((event) => {
      if (event.type === "lock-state") {
        const isLocked = Boolean(
          (event as ErkinodeEvent & { locked?: boolean }).locked,
        );
        setLockStatus((current) =>
          current ? { ...current, locked: isLocked } : current,
        );
        if (isLocked) {
          setSessions([]);
          setPage("hosts");
        } else void refresh();
      }
      if (event.type === "new-local-terminal")
        void openLocalTerminal(Boolean(event.chooseFolder));
      if (event.type === "status") {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === event.sessionId
              ? {
                  ...s,
                  status: event.status as Session["status"],
                  ...(event.message
                    ? {
                        error: event.message,
                        details: event.details,
                        code: event.code,
                      }
                    : {}),
                }
              : s,
          ),
        );
        if (event.status === "ready") void refresh();
        if (event.status === "closed")
          setTunnels((prev) =>
            prev.filter((t) => t.sessionId !== event.sessionId),
          );
      }
      if (event.type === "error") {
        const message = event.message || translate("Connection failed");
        if (event.sessionId)
          setSessions((prev) =>
            prev.map((session) =>
              session.id === event.sessionId
                ? {
                    ...session,
                    error: message,
                    details: event.details,
                    code: event.code,
                  }
                : session,
            ),
          );
        if (!event.sessionId) notify(message);
      }
      if (event.type === "host-system") void refresh();
      if (event.type === "prompt")
        setPrompts((prev) => [...prev, event as Prompt]);
      if (event.type === "prompt-expired")
        setPrompts((prev) => prev.filter((p) => p.id !== event.id));
      if (event.type === "transfer") {
        setTransfers((prev) => {
          const i = prev.findIndex((t) => t.id === event.id);
          return i < 0
            ? [...prev.slice(-99), event as Transfer]
            : prev.map((t) =>
                t.id === event.id ? ({ ...t, ...event } as Transfer) : t,
              );
        });
        if (event.status === "queued") setShowTransfers(true);
      }
    });
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setPage("settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("hosts");
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(".search-field input")
            ?.focus(),
        );
      }
      if (e.key === "Tab") {
        const overlays = document.querySelectorAll<HTMLElement>(".overlay");
        const overlay = overlays.item(overlays.length - 1);
        if (!overlay) return;
        const fields = [
          ...overlay.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = fields[0],
          last = fields.at(-1);
        if (!first) return;
        if (
          !overlay.contains(document.activeElement) ||
          (e.shiftKey && document.activeElement === first)
        ) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setHostDialog(null);
      }
      if (e.key === "Escape" && hostDialog !== undefined)
        setHostDialog(undefined);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [hostDialog]);
  useEffect(() => {
    const closeCardMenus = (event: PointerEvent) => {
      document
        .querySelectorAll<HTMLDetailsElement>(".card-menu[open]")
        .forEach((menu) => {
          if (!menu.contains(event.target as Node)) menu.open = false;
        });
    };
    const closeCardMenusWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      document
        .querySelectorAll<HTMLDetailsElement>(".card-menu[open]")
        .forEach((menu) => (menu.open = false));
    };
    document.addEventListener("pointerdown", closeCardMenus);
    window.addEventListener("keydown", closeCardMenusWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeCardMenus);
      window.removeEventListener("keydown", closeCardMenusWithEscape);
    };
  }, []);
  async function connect(
    host: Host,
    mode: Session["mode"] = "terminal",
    promptPassword = false,
    replacesId?: string,
  ) {
    const id = crypto.randomUUID();
    setSessions((prev) => [
      ...prev.filter((session) => session.id !== replacesId),
      { id, name: host.name, hostId: host.id, status: "connecting", mode },
    ]);
    setActive(id);
    setPage("workspace");
    try {
      await window.erkinode.invoke<string>("session:open", {
        hostId: host.id,
        promptPassword,
        sessionId: id,
      });
    } catch (e) {
      setSessions((prev) => prev.filter((session) => session.id !== id));
      notify((e as Error).message);
    }
  }
  async function openLocalTerminal(chooseFolder = false, replacesId?: string) {
    try {
      const session = await window.erkinode.invoke<Session | null>(
        "local:open-terminal",
        { chooseFolder },
      );
      if (!session) return;
      if (replacesId) await window.erkinode.invoke("session:close", replacesId);
      setSessions((prev) => [
        ...prev.filter((s) => s.id !== replacesId),
        session,
      ]);
      setActive(session.id);
      setPage("workspace");
    } catch (error) {
      notify((error as Error).message);
    }
  }
  async function closeSession(id: string) {
    try {
      await window.erkinode.invoke("session:close", id);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (id === active) {
          setActive(next.at(-1)?.id || "");
          if (!next.length) setPage("hosts");
        }
        return next;
      });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  useEffect(
    () =>
      window.erkinode?.onEvent((event) => {
        if (event.type === "close-active-tab" && active)
          void closeSession(active);
      }),
    [active],
  );
  async function deleteHost(host: Host) {
    if (
      !window.confirm(
        translate(
          "Delete saved host “{{name}}”? Data on the remote server will not be affected.",
          { name: host.name },
        ),
      )
    )
      return;
    try {
      await window.erkinode.invoke("host:delete", host.id);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function favorite(host: Host) {
    try {
      await window.erkinode.invoke("host:save", {
        ...host,
        favorite: !host.favorite,
      });
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const groups = [
    ...new Set(state.hosts.map((h) => h.group).filter(Boolean)),
  ].sort();
  const hosts = state.hosts
    .filter(
      (h) =>
        (filter === "all" ||
          (filter === "favorites" && h.favorite) ||
          filter === `group:${h.group}`) &&
        `${h.name} ${h.address} ${h.username} ${h.group} ${h.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    );
  const activeSession = sessions.find((s) => s.id === active),
    connected = sessions.filter(
      (s) => s.status === "ready" && s.kind !== "local",
    ).length,
    inProgress = transfers.filter((t) =>
      ["queued", "running"].includes(t.status),
    ).length;
  const visibleSessions = split
    ? ([
        activeSession,
        sessions.find((s) => s.id !== active && s.status !== "closed"),
      ].filter(Boolean) as Session[])
    : activeSession
      ? [activeSession]
      : [];
  const title =
    filter === "favorites"
      ? translate("Favorites")
      : filter.startsWith("group:")
        ? filter.slice(6)
        : translate("Hosts");
  async function runSnippet(command: string) {
    if (
      !activeSession ||
      activeSession.status !== "ready" ||
      activeSession.mode !== "terminal"
    )
      return notify(translate("Open an active terminal first"));
    try {
      await window.erkinode.invoke("session:input", {
        id: active,
        data: command,
      });
      setPage("workspace");
      notify(
        translate(
          "Command inserted into the terminal. Review it and press Enter to run.",
        ),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }
  if (lockStatus?.locked) {
    return (
      <main className="lock-screen">
        <div className="lock-card">
          <BrandMark />
          <div className="eyebrow">{translate("LOCAL VAULT LOCKED")}</div>
          <h1>{translate("Unlock Erkinode")}</h1>
          <p>
            {translate(
              lockStatus?.digits === 4
                ? "Enter your 4-digit PIN to open the local workspace."
                : "Enter your 6-digit PIN to open the local workspace.",
            )}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setPinError("");
              try {
                await window.erkinode.invoke("lock:unlock", pinEntry);
                setPinEntry("");
                setLockStatus({ ...lockStatus, locked: false, retryAfter: 0 });
                await refresh();
                void checkUpdate();
              } catch (error) {
                setPinError((error as Error).message);
                const status = await window.erkinode
                  .invoke("lock:status")
                  .catch(() => null);
                if (status) setLockStatus(status);
              }
            }}
          >
            <input
              autoFocus
              aria-label={translate("PIN")}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern={lockStatus?.digits === 4 ? "[0-9]{4}" : "[0-9]{4,6}"}
              maxLength={lockStatus?.digits || 6}
              value={pinEntry}
              onChange={(event) =>
                setPinEntry(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, lockStatus?.digits || 6),
                )
              }
            />
            {pinError && <small className="field-error">{pinError}</small>}
            <button
              className="primary"
              disabled={
                pinEntry.length !== (lockStatus?.digits || 6) &&
                pinEntry.length !== 4 &&
                pinEntry.length !== 6
              }
            >
              {translate("Unlock")}
            </button>
          </form>
        </div>
      </main>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="traffic-space" />
        <div className="brand">
          <span className="brand-icon">
            <BrandMark />
          </span>
          <span>
            {translate("erkinode")}
            <span className="brand-dot">.</span>
          </span>
        </div>
        <div className="vault-label">
          <span className="tiny-dot" />
          {translate("Personal workspace")}
          <LockKeyhole size={12} />
        </div>
        <nav className="main-nav">
          <button
            className={page === "hosts" && filter === "all" ? "active" : ""}
            onClick={() => {
              setPage("hosts");
              setFilter("all");
            }}
          >
            <Server size={18} />
            {translate("All hosts")}
            <span>{state.hosts.length}</span>
          </button>
          <button
            className={
              page === "hosts" && filter === "favorites" ? "active" : ""
            }
            onClick={() => {
              setPage("hosts");
              setFilter("favorites");
            }}
          >
            <Star size={18} />
            {translate("Favorites")}
            <span>{state.hosts.filter((h) => h.favorite).length || ""}</span>
          </button>
          <button
            className={page === "workspace" ? "active" : ""}
            onClick={() =>
              sessions.length
                ? setPage("workspace")
                : notify(translate("Add a host and open SSH or SFTP"))
            }
          >
            <Terminal size={18} />
            {translate("Connections")}
            {connected > 0 && <span className="count-online">{connected}</span>}
          </button>
          <button
            onClick={() => void openLocalTerminal()}
            title={
              translate("New local terminal") +
              " (" +
              (state.platform === "darwin" ? "⌘ T" : "Ctrl Shift T") +
              ")"
            }
          >
            <Monitor size={18} />
            {translate("Local terminal")}
            <Plus size={14} />
          </button>
          <button
            className={page === "snippets" ? "active" : ""}
            onClick={() => setPage("snippets")}
          >
            <Code2 size={18} />
            {translate("Snippets")}
          </button>
          <button
            className={page === "security" ? "active" : ""}
            onClick={() => setPage("security")}
          >
            <KeyRound size={18} />
            {translate("Keys and trust")}
          </button>
        </nav>
        <div className="section-label">
          {translate("GROUPS")}{" "}
          <button
            title={translate("Add group")}
            onClick={() => {
              setHostDialog(null);
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="group-nav">
          {groups.map((g) => (
            <button
              key={g}
              className={
                page === "hosts" && filter === `group:${g}` ? "active" : ""
              }
              onClick={() => {
                setFilter(`group:${g}`);
                setPage("hosts");
              }}
            >
              <Folder size={16} />
              {g}
              <span>{state.hosts.filter((h) => h.group === g).length}</span>
            </button>
          ))}
          {!groups.length && (
            <p className="nav-hint">
              {translate("Groups appear after you add hosts")}
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "settings active" : "settings"}
            onClick={() => setPage("settings")}
          >
            <Settings size={18} />
            {translate("Settings")}
            <span>{primaryModifier} ,</span>
          </button>
          <div className="profile">
            <div className="avatar">
              <BrandMark size={24} />
            </div>
            <div>
              {translate("Local vault")}
              <small>
                {translate("Erkinode")} {state.version || appVersion}
              </small>
            </div>
            <span className="tiny-dot" />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="titlebar">
          <div className="breadcrumb">
            {translate("Personal workspace")}
            <ChevronRight size={13} />
            <span>
              {page === "hosts"
                ? title
                : page === "workspace"
                  ? translate("Connections")
                  : page === "snippets"
                    ? translate("Snippets")
                    : page === "security"
                      ? translate("Keys and trust")
                      : translate("Settings")}
            </span>
          </div>
          <div className="titlebar-right">
            <span className="tiny-dot" />
            {translate("Local-first")}
            <span className="version">{state.version || appVersion}</span>
          </div>
        </div>
        {updateInfo?.available && !updateDismissed && updateInfo.url && (
          <div className="update-banner" role="status">
            <Download size={16} />
            <span>
              {translate("Erkinode {{version}} is available.", {
                version: updateInfo.latestVersion,
              })}
            </span>
            <button
              onClick={() =>
                void window.erkinode
                  .invoke("update:open", { url: updateInfo.url })
                  .catch((error) => notify((error as Error).message))
              }
            >
              {translate("View update")}
              <ArrowUpRight size={14} />
            </button>
            <button
              className="update-dismiss"
              aria-label={translate("Dismiss update notice")}
              onClick={() => setUpdateDismissed(true)}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {page === "hosts" && (
          <div className="page hosts-page">
            <header className="page-header">
              <div>
                <div className="eyebrow">
                  {translate("YOUR INFRASTRUCTURE, CONNECTED")}
                </div>
                <h1>
                  {title}
                  <span>{hosts.length}</span>
                </h1>
                <p>{translate("Less setup. More time with your servers.")}</p>
              </div>
              <div className="host-header-actions">
                <button onClick={() => void openLocalTerminal()}>
                  <Monitor size={17} />
                  {translate("Local terminal")}
                </button>
                <button className="primary" onClick={() => setHostDialog(null)}>
                  <Plus size={18} />
                  {translate("New host")}
                  <kbd>{primaryModifier + " N"}</kbd>
                </button>
              </div>
            </header>
            <div className="overview">
              <div>
                <span className="overview-icon">
                  <Server size={18} />
                </span>
                <div>
                  <strong>{state.hosts.length}</strong>
                  <span>{translate("saved hosts")}</span>
                </div>
              </div>
              <div>
                <span className="overview-icon green">
                  <Circle size={17} />
                </span>
                <div>
                  <strong>
                    {connected}
                    <span className="live-label">{translate("active")}</span>
                  </strong>
                  <span>{translate("SSH connections")}</span>
                </div>
              </div>
              <div>
                <span className="overview-icon">
                  <Folder size={18} />
                </span>
                <div>
                  <strong>{groups.length}</strong>
                  <span>{translate("host groups")}</span>
                </div>
              </div>
            </div>
            <div className="search-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label={translate("Search hosts")}
                  placeholder={translate("Search by name, address, or tag…")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <kbd>{translate("Search")}</kbd>
              </div>
              <div className="segmented">
                <button
                  aria-label={translate("Grid view")}
                  className={layout === "grid" ? "active" : ""}
                  onClick={() => setLayout("grid")}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  aria-label={translate("List view")}
                  className={layout === "list" ? "active" : ""}
                  onClick={() => setLayout("list")}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
            <div className="list-heading">
              <span>{filter === "all" ? translate("All hosts") : title}</span>
              <span>{translate("Name ↑")}</span>
            </div>
            {hosts.length > 0 ? (
              <div className={`hosts ${layout}`}>
                {hosts.map((host) => {
                  const hostSession = sessions.find(
                    (session) =>
                      session.hostId === host.id &&
                      session.kind !== "local" &&
                      session.status !== "closed",
                  );
                  const hostStatus =
                    hostSession?.status === "ready"
                      ? "connected"
                      : hostSession
                        ? "connecting"
                        : "idle";
                  return (
                    <article className="host-card" key={host.id}>
                      <div className="card-top">
                        <div className={`icon-box ${host.color}`}>
                          <SystemIcon system={host.system} size={27} />
                        </div>
                        <div className="card-top-actions">
                          <button
                            title={
                              host.favorite
                                ? translate("Remove from favorites")
                                : translate("Add to favorites")
                            }
                            className={
                              host.favorite ? "favorite on" : "favorite"
                            }
                            onClick={() => void favorite(host)}
                          >
                            <Star
                              size={17}
                              fill={host.favorite ? "currentColor" : "none"}
                            />
                          </button>
                          <details className="card-menu">
                            <summary
                              aria-label={translate("More actions")}
                              title={translate("More actions")}
                            >
                              <Ellipsis size={17} />
                            </summary>
                            <div>
                              <button onClick={() => setHostDialog(host)}>
                                <Pencil size={13} />
                                {translate("Edit host")}
                              </button>
                              <button
                                className="danger"
                                onClick={() => void deleteHost(host)}
                              >
                                <Trash2 size={13} />
                                {translate("Delete host")}
                              </button>
                            </div>
                          </details>
                        </div>
                      </div>
                      <div className="host-info">
                        <h3>{host.name}</h3>
                        <p>
                          {host.username}@{host.address}
                          <span>:{host.port}</span>
                        </p>
                        <div
                          className={`host-system-label ${host.system ? "" : "unknown"}`}
                          title={
                            host.system
                              ? translate("Last detected: {{date}}", {
                                  date: new Date(
                                    host.system.detectedAt,
                                  ).toLocaleString(i18n.resolvedLanguage),
                                })
                              : undefined
                          }
                        >
                          {host.system
                            ? host.system.name +
                              (host.system.version &&
                              !host.system.name.includes(host.system.version)
                                ? ` · ${host.system.version}`
                                : "")
                            : translate("System not detected")}
                        </div>
                      </div>
                      <div className="host-tags">
                        <span className={`connection-state ${hostStatus}`}>
                          <i />
                          {hostStatus === "connected"
                            ? translate("Connected")
                            : hostStatus === "connecting"
                              ? translate("Connecting…")
                              : translate("Not connected")}
                        </span>
                        <span>
                          <Folder size={11} />
                          {host.group || translate("Ungrouped")}
                        </span>
                        {host.tags.slice(0, 2).map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                      <div className="card-divider" />
                      <div className="connect-buttons">
                        <button
                          className="connect"
                          onClick={() => void connect(host)}
                        >
                          <Terminal size={15} />
                          {translate("SSH")}
                          <ArrowUpRight size={15} />
                        </button>
                        <button onClick={() => void connect(host, "sftp")}>
                          <Files size={15} />
                          {translate("SFTP")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-illustration">
                  <span />
                  <div>
                    <Server size={39} strokeWidth={1.3} />
                  </div>
                  <span />
                </div>
                <h2>
                  {query || filter !== "all"
                    ? translate("No hosts found")
                    : translate("Your infrastructure starts here")}
                </h2>
                <p>
                  {query || filter !== "all"
                    ? translate("Try a different search or add a host.")
                    : translate(
                        "Add your first host with its address, username, and authentication method.\nKeep your terminal and files within reach.",
                      )}
                </p>
                <button className="primary" onClick={() => setHostDialog(null)}>
                  <Plus size={17} />
                  {translate("Add host")}
                </button>
                <div className="empty-features">
                  <span>
                    <Terminal size={15} />
                    {translate("SSH terminal")}
                  </span>
                  <span>
                    <Files size={15} />
                    {translate("SFTP files")}
                  </span>
                  <span>
                    <KeyRound size={15} />
                    {translate("Protected keys")}
                  </span>
                </div>
              </div>
            )}
            <div className="bottom-tip">
              <span>
                <ShieldCheck size={16} />
                {translate(
                  "Hosts and credentials are encrypted on this device. Connections go directly to your server.",
                )}
              </span>
              <button onClick={() => setPage("security")}>
                {translate("How it works")}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        )}
        <div className={`workspace ${page === "workspace" ? "" : "offscreen"}`}>
          <div className="session-tabs">
            <button
              className="home-tab"
              title={translate("Back to hosts")}
              onClick={() => setPage("hosts")}
            >
              <ArrowLeft size={17} />
            </button>
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-tab ${active === s.id ? "active" : ""}`}
              >
                <button onClick={() => setActive(s.id)}>
                  <span className={`status-dot ${s.status}`} />
                  {s.kind === "local" && <Monitor size={13} />}
                  {s.kind === "local"
                    ? translate("Local") + " · " + s.name
                    : s.name}
                </button>
                <button
                  aria-label={translate("Close {{name}}", { name: s.name })}
                  onClick={() => void closeSession(s.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              title={translate("New local terminal")}
              aria-label={translate("New local terminal")}
              onClick={() => void openLocalTerminal()}
            >
              <Plus size={17} />
            </button>
            <button
              title={translate("Add connection")}
              aria-label={translate("Add connection")}
              onClick={() => setPage("hosts")}
            >
              <Server size={17} />
            </button>
            <button
              className="split-button"
              title={translate("Split connections")}
              onClick={() => setSplit(!split)}
            >
              <Columns2 size={17} />
            </button>
          </div>
          <div
            className={`session-panes ${split && visibleSessions.length > 1 ? "split" : ""}`}
          >
            {sessions.map((s) => {
              const shown =
                page === "workspace" &&
                visibleSessions.some((v) => v.id === s.id);
              return (
                <section
                  key={s.id}
                  className={`session-pane ${shown ? "" : "offscreen"}`}
                >
                  <div className="session-toolbar">
                    <span>
                      <span className={`status-dot ${s.status}`} />
                      {s.kind === "local" ? (
                        <>
                          <Monitor size={14} />
                          {s.hostname} · {s.name}
                          <span
                            className="local-cwd"
                            title={translate("Starting folder: {{path}}", {
                              path: s.cwd || "",
                            })}
                          >
                            {s.cwd}
                          </span>
                        </>
                      ) : (
                        <>
                          {state.hosts.find((h) => h.id === s.hostId)?.username}
                          @
                          {state.hosts.find((h) => h.id === s.hostId)
                            ?.address || s.name}
                        </>
                      )}
                    </span>
                    {s.kind === "local" && (
                      <button
                        className="local-folder-button"
                        title={translate("Open terminal in folder")}
                        onClick={() => void openLocalTerminal(true)}
                      >
                        <Folder size={14} />
                        {translate("Open in folder…")}
                      </button>
                    )}
                    {s.kind !== "local" && (
                      <div className="segmented">
                        <button
                          className={s.mode === "terminal" ? "active" : ""}
                          onClick={() => {
                            setActive(s.id);
                            setSessions((prev) =>
                              prev.map((x) =>
                                x.id === s.id ? { ...x, mode: "terminal" } : x,
                              ),
                            );
                          }}
                        >
                          <Terminal size={14} />
                          {translate("Terminal")}
                        </button>
                        <button
                          className={s.mode === "sftp" ? "active" : ""}
                          onClick={() => {
                            setActive(s.id);
                            setSessions((prev) =>
                              prev.map((x) =>
                                x.id === s.id ? { ...x, mode: "sftp" } : x,
                              ),
                            );
                          }}
                        >
                          <Files size={14} />
                          {translate("SFTP")}
                        </button>
                      </div>
                    )}
                  </div>
                  {s.status === "connecting" && (
                    <div className="connecting">
                      <div className="loader" />
                      {translate("Connecting…")}
                      <small>
                        {translate("Check the host key confirmation prompt")}
                      </small>
                    </div>
                  )}
                  <div
                    className={
                      s.mode === "terminal"
                        ? "terminal-container"
                        : "terminal-container offscreen"
                    }
                  >
                    <TerminalView
                      session={s}
                      visible={shown && s.mode === "terminal"}
                      fontSize={state.settings.fontSize}
                      onError={notify}
                      snippets={state.snippets}
                      onOpenSftp={() =>
                        setSessions((prev) =>
                          prev.map((session) =>
                            session.id === s.id
                              ? { ...session, mode: "sftp" }
                              : session,
                          ),
                        )
                      }
                      onDisconnect={() => void closeSession(s.id)}
                    />
                  </div>
                  {s.status === "ready" && s.kind !== "local" && (
                    <div
                      className={
                        s.mode === "sftp"
                          ? "sftp-container"
                          : "sftp-container offscreen"
                      }
                    >
                      <SftpView
                        id={s.id}
                        visible={shown && s.mode === "sftp"}
                        onError={notify}
                      />
                    </div>
                  )}
                  {s.status === "closed" && (
                    <div
                      className={`closed-banner${s.error ? " error" : ""}`}
                      role={s.error ? "alert" : "status"}
                    >
                      <div className="connection-message">
                        <strong>
                          {translate(
                            s.kind === "local"
                              ? s.error
                                ? "Could not start the local shell."
                                : "Local terminal closed"
                              : s.error
                                ? connectionErrorTitles[s.code || ""] ||
                                  "Connection failed"
                                : "Connection closed",
                          )}
                        </strong>
                        {s.error && <p>{s.error}</p>}
                        {s.details && (
                          <details>
                            <summary>{translate("Technical details")}</summary>
                            <code>{s.details}</code>
                          </details>
                        )}
                      </div>
                      <div className="connection-actions">
                        {s.kind !== "local" &&
                          editableConnectionErrors.has(s.code || "") && (
                            <button
                              onClick={() => {
                                const host = state.hosts.find(
                                  (host) => host.id === s.hostId,
                                );
                                if (host) setHostDialog(host);
                              }}
                            >
                              {translate("Edit connection")}
                            </button>
                          )}
                        {s.code === "AUTH_FAILED" &&
                          state.hosts.find((host) => host.id === s.hostId)
                            ?.auth === "password" && (
                            <button
                              onClick={() => {
                                const host = state.hosts.find(
                                  (host) => host.id === s.hostId,
                                );
                                if (host)
                                  void connect(host, s.mode, true, s.id);
                              }}
                            >
                              {translate("Enter password again")}
                            </button>
                          )}
                        <button
                          onClick={() => {
                            const host = state.hosts.find(
                              (host) => host.id === s.hostId,
                            );
                            if (s.kind === "local")
                              void openLocalTerminal(false, s.id);
                            else if (host)
                              void connect(host, s.mode, false, s.id);
                          }}
                        >
                          {translate(
                            s.kind === "local"
                              ? "New local terminal"
                              : "Reconnect",
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          {activeSession && (
            <div className="workspace-footer">
              <span>
                <ShieldCheck size={13} />
                {activeSession.kind === "local"
                  ? translate("Local ·")
                  : translate("SSH ·")}{" "}
                {activeSession.status === "ready"
                  ? translate(
                      activeSession.kind === "local"
                        ? "Running on this device"
                        : "Secure connection",
                    )
                  : activeSession.status === "closed"
                    ? translate("Disconnected")
                    : translate("Connection")}
              </span>
              <div>
                <button onClick={() => setPage("snippets")}>
                  <Code2 size={14} />
                  {translate("Snippets")}
                </button>
                <button
                  disabled={
                    activeSession.status !== "ready" ||
                    activeSession.kind === "local"
                  }
                  onClick={() => setTunnelDialog(true)}
                >
                  <Cable size={14} />
                  {translate("Tunnel")}
                </button>
              </div>
            </div>
          )}
        </div>
        {page === "snippets" && (
          <div className="page">
            <header className="page-header">
              <div>
                <div className="eyebrow">
                  {translate("COMMANDS WITHIN REACH")}
                </div>
                <h1>{translate("Snippets")}</h1>
                <p>
                  {translate(
                    "Save commands and insert them into the active terminal.",
                  )}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => setSnippetDialog({ name: "", command: "" })}
              >
                <Plus size={17} />
                {translate("New snippet")}
              </button>
            </header>
            <div className="snippet-grid">
              {state.snippets.map((s) => (
                <article key={s.id} className="snippet-card">
                  <header>
                    <Code2 size={19} />
                    <h3>{s.name}</h3>
                    <button
                      title={translate("Edit")}
                      onClick={() => setSnippetDialog(s)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      title={translate("Delete")}
                      onClick={async () => {
                        if (
                          window.confirm(
                            translate("Delete “{{name}}”?", { name: s.name }),
                          )
                        ) {
                          await window.erkinode
                            .invoke("snippet:delete", s.id)
                            .catch((e) => notify(e.message));
                          await refresh();
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </header>
                  <pre>{s.command}</pre>
                  <button onClick={() => void runSnippet(s.command)}>
                    <Play size={14} />
                    {translate("Insert into terminal")}
                  </button>
                </article>
              ))}
            </div>
            {!state.snippets.length && (
              <div className="simple-empty">
                <Code2 size={40} />
                <h2>{translate("Keep useful commands close")}</h2>
                <p>
                  {translate(
                    "Save a useful command and review it in the terminal before running it.",
                  )}
                </p>
                <button
                  onClick={() =>
                    setSnippetDialog({
                      name: translate("Host status"),
                      command: "uptime && df -h",
                    })
                  }
                >
                  {translate("Add your first snippet")}
                </button>
              </div>
            )}
          </div>
        )}
        {page === "security" && (
          <div className="page">
            <header className="page-header">
              <div>
                <div className="eyebrow">
                  {translate("TRUST UNDER YOUR CONTROL")}
                </div>
                <h1>{translate("Keys and trust")}</h1>
                <p>
                  {translate(
                    "Local credentials and verified host fingerprints.",
                  )}
                </p>
              </div>
              <ShieldCheck size={32} className="accent" />
            </header>
            <div className="security-summary">
              <LockKeyhole size={25} />
              <div>
                <h3>{translate("Encrypted local vault")}</h3>
                <p>
                  {translate(
                    "On macOS, Keychain protects the encryption key. Passwords and private keys are not exposed in the repository, logs, or browser localStorage.",
                  )}
                </p>
              </div>
            </div>
            <h2 className="subheading">
              {translate("SSH keys")}
              <span>{state.hosts.filter((h) => h.hasKey).length}</span>
            </h2>
            {state.hosts
              .filter((h) => h.hasKey)
              .map((h) => (
                <div className="settings-row" key={h.id}>
                  <KeyRound size={19} />
                  <div>
                    <strong>{h.name}</strong>
                    <small>
                      {h.username}@{h.address} ·{" "}
                      {h.hasPassphrase
                        ? translate("with a passphrase")
                        : translate("key in encrypted vault")}
                    </small>
                  </div>
                  <button onClick={() => setHostDialog(h)}>
                    {translate("Manage")}
                  </button>
                </div>
              ))}
            {!state.hosts.some((h) => h.hasKey) && (
              <p className="muted">
                {translate(
                  "Import or generate a key in Host settings → Authentication.",
                )}
              </p>
            )}
            <h2 className="subheading">
              {translate("Trusted hosts")}
              <span>{Object.keys(state.knownHosts).length}</span>
            </h2>
            {Object.entries(state.knownHosts).map(([address, fp]) => (
              <div className="settings-row known-host" key={address}>
                <ShieldCheck size={18} />
                <div>
                  <strong>{address}</strong>
                  <code>{fp}</code>
                </div>
                <button
                  onClick={async () => {
                    await window.erkinode
                      .invoke("known:forget", address)
                      .catch((e) => notify(e.message));
                    await refresh();
                  }}
                >
                  {translate("Forget")}
                </button>
              </div>
            ))}
            {!Object.keys(state.knownHosts).length && (
              <p className="muted">
                {translate(
                  "Host fingerprints appear here after the first trusted connection.",
                )}
              </p>
            )}
          </div>
        )}
        {page === "settings" && (
          <div className="page settings-page">
            <header className="page-header">
              <div>
                <div className="eyebrow">
                  {translate("MAKE IT YOUR WORKSPACE")}
                </div>
                <h1>{translate("Settings")}</h1>
                <p>
                  {translate(
                    "Terminal preferences, backups, and application information.",
                  )}
                </p>
              </div>
            </header>
            <h2 className="subheading">{translate("General")}</h2>
            <div className="settings-row">
              <div>
                <strong>{translate("Language")}</strong>
                <small>
                  {translate(
                    "Changes apply immediately and are saved on this device.",
                  )}
                </small>
              </div>
              <select
                aria-label={translate("Language")}
                value={state.settings.language}
                onChange={async (event) => {
                  try {
                    await window.erkinode.invoke("settings:save", {
                      language: event.target.value,
                    });
                    await refresh();
                  } catch (error) {
                    notify((error as Error).message);
                  }
                }}
              >
                {languages.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <h2 className="subheading">{translate("Terminal")}</h2>
            <div className="settings-row">
              <Terminal size={20} />
              <div>
                <strong>{translate("Font size")}</strong>
                <small>{translate("Applies to all open terminals")}</small>
              </div>
              <select
                aria-label={translate("Font size")}
                value={state.settings.fontSize}
                onChange={async (e) => {
                  await window.erkinode
                    .invoke("settings:save", {
                      fontSize: Number(e.target.value),
                    })
                    .catch((e) => notify(e.message));
                  await refresh();
                }}
              >
                {[11, 12, 13, 14, 15, 16, 18, 20, 24].map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {translate("px")}
                  </option>
                ))}
              </select>
            </div>
            <h2 className="subheading">{translate("Security")}</h2>
            <div className="settings-row">
              <LockKeyhole size={20} />
              <div>
                <strong>{translate("PIN lock")}</strong>
                <small>
                  {state.settings.pinLock.enabled
                    ? translate(
                        "Locks on launch, sleep, or when you lock it manually.",
                      )
                    : translate(
                        "Optional local lock. Your vault remains protected by the system credential store.",
                      )}
                </small>
              </div>
              {state.settings.pinLock.enabled ? (
                <div className="settings-actions">
                  <button
                    onClick={() => void window.erkinode.invoke("lock:now")}
                  >
                    {translate("Lock now")}
                  </button>
                  <button
                    onClick={() => {
                      setPinEntry("");
                      setPinDialog("disable");
                    }}
                  >
                    {translate("Disable")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setPinEntry("");
                    setPinConfirm("");
                    setPinIdleMinutes(0);
                    setPinDialog("enable");
                  }}
                >
                  {translate("Enable")}
                </button>
              )}
            </div>
            {state.settings.pinLock.enabled && (
              <div className="settings-row">
                <div>
                  <strong>{translate("Lock after inactivity")}</strong>
                  <small>
                    {translate(
                      "Long-running connections are closed when Erkinode locks.",
                    )}
                  </small>
                </div>
                <button
                  onClick={() => {
                    setPinEntry("");
                    setPinIdleMinutes(state.settings.pinLock.idleMinutes);
                    setPinDialog("idle");
                  }}
                >
                  {state.settings.pinLock.idleMinutes
                    ? translate("{{count}} minutes", {
                        count: state.settings.pinLock.idleMinutes,
                      })
                    : translate("Never")}
                </button>
              </div>
            )}
            <h2 className="subheading">{translate("Backups")}</h2>
            <div className="settings-row">
              <Download size={20} />
              <div>
                <strong>{translate("Export encrypted vault")}</strong>
                <small>
                  {translate(
                    "Hosts, credentials, snippets, and trusted keys · AES-256-GCM + scrypt",
                  )}
                </small>
              </div>
              <button
                onClick={() => {
                  setBackup("export");
                  setBackupPassword("");
                }}
              >
                {translate("Export")}
              </button>
            </div>
            <div className="settings-row">
              <Upload size={20} />
              <div>
                <strong>{translate("Restore from backup")}</strong>
                <small>
                  {translate(
                    "Replaces the current vault. Requires the backup password.",
                  )}
                </small>
              </div>
              <button
                onClick={() => {
                  setBackup("restore");
                  setBackupPassword("");
                }}
              >
                {translate("Restore")}
              </button>
            </div>
            <h2 className="subheading">{translate("Active tunnels")}</h2>
            {tunnels.map((t) => (
              <div className="settings-row" key={t.id}>
                <Cable size={18} />
                <div>
                  <strong>
                    127.0.0.1:{t.localPort} → {t.targetHost}:{t.targetPort}
                  </strong>
                  <small>
                    {translate(
                      "Loopback only · until the SSH connection closes",
                    )}
                  </small>
                </div>
                <button
                  onClick={async () => {
                    await window.erkinode
                      .invoke("tunnel:stop", t.id)
                      .catch((e) => notify(e.message));
                    setTunnels((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                >
                  {translate("Stop")}
                </button>
              </div>
            ))}
            {!tunnels.length && (
              <p className="muted">
                {translate("Create a tunnel from an active connection.")}
              </p>
            )}
            <h2 className="subheading">{translate("About Erkinode")}</h2>
            <div className="settings-row">
              <Download size={20} />
              <div>
                <strong>{translate("Software updates")}</strong>
                <small>
                  {updateInfo?.available
                    ? translate("Version {{version}} is available.", {
                        version: updateInfo.latestVersion,
                      })
                    : translate(
                        "Checks the official Erkinode releases on GitHub.",
                      )}
                </small>
              </div>
              <button
                disabled={checkingUpdate}
                onClick={() => void checkUpdate(true)}
              >
                {checkingUpdate
                  ? translate("Checking…")
                  : translate("Check for updates")}
              </button>
            </div>
            <p className="about-copy">
              {translate("Version")} {state.version || appVersion}{" "}
              {translate("· MIT OR Apache-2.0")}
              <br />
              {translate(
                "Connects directly to your servers. Cloud sync and team features are not implemented yet. See the repository README for features and limitations.",
              )}
              <br />
              {translate("Your servers. Your freedom.")}
            </p>
          </div>
        )}
        <div className="app-status">
          <span>
            <span className="tiny-dot" />
            {page === "workspace" &&
            activeSession?.kind === "local" &&
            activeSession.status === "ready"
              ? translate("Running on this device")
              : connected
                ? translate("connectionsCount", { count: connected })
                : translate("Ready to connect")}
          </span>
          <button
            className={showTransfers ? "active" : ""}
            onClick={() => setShowTransfers(!showTransfers)}
          >
            <Download size={13} />
            {translate("Transfers")}
            {inProgress > 0 && <b>{inProgress}</b>}
          </button>
          <span>
            <ShieldCheck size={13} />
            {translate("Encrypted local vault")}
          </span>
        </div>
      </main>
      {showTransfers && (
        <aside className="transfers-panel">
          <header>
            <h3>
              {translate("File transfers")}
              <span>{transfers.length}</span>
            </h3>
            <button
              title={translate("Close transfers")}
              onClick={() => setShowTransfers(false)}
            >
              <X size={18} />
            </button>
          </header>
          {transfers.length === 0 && (
            <div className="simple-empty">
              <Files size={32} />
              <p>{translate("SFTP uploads and downloads appear here.")}</p>
            </div>
          )}
          {transfers.map((t) => (
            <div className="transfer" key={t.id}>
              <div className="transfer-icon">
                {t.status === "done" ? (
                  <Check size={18} />
                ) : t.direction === "upload" ? (
                  <Upload size={18} />
                ) : (
                  <Download size={18} />
                )}
              </div>
              <div>
                <strong>{t.name}</strong>
                <small>
                  {t.status === "done"
                    ? translate("Completed")
                    : t.status === "cancelled"
                      ? translate("Canceled")
                      : t.status === "error"
                        ? t.message
                        : `${Math.round((t.transferred / Math.max(t.size, 1)) * 100)}% · ${(t.transferred / 1048576).toFixed(1)} / ${(t.size / 1048576).toFixed(1)} ${translate("MB")}`}
                </small>
                <progress
                  max={Math.max(t.size, 1)}
                  value={
                    t.status === "done" ? Math.max(t.size, 1) : t.transferred
                  }
                />
              </div>
              {["running", "queued"].includes(t.status) && (
                <button
                  title={translate("Cancel")}
                  onClick={() =>
                    window.erkinode
                      .invoke("transfer:cancel", t.id)
                      .catch((e) => notify(e.message))
                  }
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </aside>
      )}
      {hostDialog !== undefined && (
        <HostDialog
          host={hostDialog}
          hosts={state.hosts}
          close={() => setHostDialog(undefined)}
          saved={() => {
            setHostDialog(undefined);
            void refresh();
          }}
          onError={notify}
        />
      )}
      {snippetDialog && (
        <div className="overlay">
          <form
            className="dialog compact"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await window.erkinode.invoke("snippet:save", snippetDialog);
                setSnippetDialog(null);
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <header>
              <h2>
                {snippetDialog.id
                  ? translate("Edit snippet")
                  : translate("New snippet")}
              </h2>
              <button
                type="button"
                title={translate("Close")}
                onClick={() => setSnippetDialog(null)}
              >
                <X size={18} />
              </button>
            </header>
            <label>
              {translate("Name")}
              <input
                required
                autoFocus
                value={snippetDialog.name}
                onChange={(e) =>
                  setSnippetDialog({ ...snippetDialog, name: e.target.value })
                }
              />
            </label>
            <label>
              {translate("Command")}
              <textarea
                required
                rows={5}
                spellCheck={false}
                value={snippetDialog.command}
                onChange={(e) =>
                  setSnippetDialog({
                    ...snippetDialog,
                    command: e.target.value,
                  })
                }
              />
            </label>
            <footer>
              <button type="button" onClick={() => setSnippetDialog(null)}>
                {translate("Cancel")}
              </button>
              <button className="primary">{translate("Save")}</button>
            </footer>
          </form>
        </div>
      )}
      {tunnelDialog && (
        <div className="overlay">
          <form
            className="dialog compact"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                const result = await window.erkinode.invoke<any>(
                  "tunnel:start",
                  {
                    sessionId: active,
                    localPort: Number(form.get("localPort")),
                    targetHost: form.get("targetHost"),
                    targetPort: Number(form.get("targetPort")),
                  },
                );
                setTunnels((prev) => [...prev, result]);
                setTunnelDialog(false);
                notify(
                  translate("Tunnel open: 127.0.0.1:{{port}}", {
                    port: result.localPort,
                  }),
                );
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <header>
              <h2>{translate("Local SSH tunnel")}</h2>
              <button
                type="button"
                title={translate("Close")}
                onClick={() => setTunnelDialog(false)}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              {translate(
                "Accessible only from this computer. The SSH server connects to the destination.",
              )}
            </p>
            <label>
              {translate("Local port")}
              <input
                required
                type="number"
                name="localPort"
                defaultValue={8080}
                min={0}
                max={65535}
              />
            </label>
            <label>
              {translate("Destination address")}
              <input required name="targetHost" defaultValue="127.0.0.1" />
            </label>
            <label>
              {translate("Destination port")}
              <input
                required
                type="number"
                name="targetPort"
                defaultValue={80}
                min={1}
                max={65535}
              />
            </label>
            <footer>
              <button type="button" onClick={() => setTunnelDialog(false)}>
                {translate("Cancel")}
              </button>
              <button className="primary">{translate("Open tunnel")}</button>
            </footer>
          </form>
        </div>
      )}
      {pinDialog && (
        <div className="overlay">
          <form
            className="dialog compact"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                if (pinDialog === "enable") {
                  if (pinEntry !== pinConfirm)
                    throw new Error(translate("PINs do not match"));
                  await window.erkinode.invoke("lock:setup", {
                    pin: pinEntry,
                    idleMinutes: pinIdleMinutes,
                  });
                } else if (pinDialog === "disable") {
                  await window.erkinode.invoke("lock:disable", pinEntry);
                } else {
                  await window.erkinode.invoke("lock:idle", {
                    pin: pinEntry,
                    idleMinutes: pinIdleMinutes,
                  });
                }
                setPinDialog(null);
                setPinEntry("");
                setPinConfirm("");
                await refresh();
                const status = await window.erkinode.invoke("lock:status");
                setLockStatus(status);
                notify(translate("PIN lock settings saved"));
              } catch (error) {
                notify((error as Error).message);
              }
            }}
          >
            <h2>
              {translate(
                pinDialog === "enable"
                  ? "Enable PIN lock"
                  : pinDialog === "disable"
                    ? "Disable PIN lock"
                    : "Lock after inactivity",
              )}
            </h2>
            {pinDialog === "enable" && (
              <div className="pin-digits-selector">
                <button
                  type="button"
                  className={pinDigits === 4 ? "active" : ""}
                  onClick={() => {
                    setPinDigits(4);
                    setPinEntry("");
                    setPinConfirm("");
                  }}
                >
                  {translate("4 digits")}
                </button>
                <button
                  type="button"
                  className={pinDigits === 6 ? "active" : ""}
                  onClick={() => {
                    setPinDigits(6);
                    setPinEntry("");
                    setPinConfirm("");
                  }}
                >
                  {translate("6 digits")}
                </button>
              </div>
            )}
            <p>
              {translate(
                pinDialog === "enable"
                  ? pinDigits === 4
                    ? "Choose a 4-digit PIN. It is a local app lock, not the encryption key for your vault."
                    : "Choose a 6-digit PIN. It is a local app lock, not the encryption key for your vault."
                  : "Enter your current PIN to confirm this change.",
              )}
            </p>
            <label>
              {translate(pinDialog === "enable" ? "New PIN" : "Current PIN")}
              <input
                autoFocus
                required
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern={
                  pinDialog === "enable"
                    ? `[0-9]{${pinDigits}}`
                    : "[0-9]{4,6}"
                }
                maxLength={
                  pinDialog === "enable"
                    ? pinDigits
                    : lockStatus?.digits || 6
                }
                value={pinEntry}
                onChange={(event) =>
                  setPinEntry(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(
                        0,
                        pinDialog === "enable"
                          ? pinDigits
                          : lockStatus?.digits || 6,
                      ),
                  )
                }
              />
            </label>
            {pinDialog === "enable" && (
              <label>
                {translate("Confirm PIN")}
                <input
                  required
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern={`[0-9]{${pinDigits}}`}
                  maxLength={pinDigits}
                  value={pinConfirm}
                  onChange={(event) =>
                    setPinConfirm(
                      event.target.value.replace(/\D/g, "").slice(0, pinDigits),
                    )
                  }
                />
              </label>
            )}
            {(pinDialog === "enable" || pinDialog === "idle") && (
              <label>
                {translate("Lock after inactivity")}
                <select
                  value={pinIdleMinutes}
                  onChange={(event) =>
                    setPinIdleMinutes(Number(event.target.value))
                  }
                >
                  <option value={0}>{translate("Never")}</option>
                  <option value={5}>5 {translate("minutes")}</option>
                  <option value={15}>15 {translate("minutes")}</option>
                  <option value={30}>30 {translate("minutes")}</option>
                  <option value={60}>60 {translate("minutes")}</option>
                </select>
              </label>
            )}
            <footer>
              <button type="button" onClick={() => setPinDialog(null)}>
                {translate("Cancel")}
              </button>
              <button
                className="primary"
                disabled={
                  pinDialog === "enable"
                    ? pinEntry.length !== pinDigits ||
                      pinConfirm.length !== pinDigits
                    : pinEntry.length !== 4 && pinEntry.length !== 6
                }
              >
                {translate("Save")}
              </button>
            </footer>
          </form>
        </div>
      )}
      {backup && (
        <div className="overlay">
          <form
            className="dialog compact"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const result = await window.erkinode.invoke(
                  `backup:${backup}`,
                  backupPassword,
                );
                if (result) {
                  setBackup(null);
                  setBackupPassword("");
                  await refresh();
                  notify(
                    backup === "export"
                      ? translate("Backup saved")
                      : translate("Vault restored"),
                  );
                }
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <h2>
              {backup === "export"
                ? translate("Export vault")
                : translate("Restore vault")}
            </h2>
            <p>
              {translate(
                "The password protects the backup, including saved credentials and keys. Keep it separately: the backup cannot be restored without it.",
              )}
            </p>
            <label>
              {translate("Backup password")}
              <input
                autoFocus
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
              />
            </label>
            <footer>
              <button
                type="button"
                onClick={() => {
                  setBackup(null);
                  setBackupPassword("");
                }}
              >
                {translate("Cancel")}
              </button>
              <button className="primary">{translate("Continue")}</button>
            </footer>
          </form>
        </div>
      )}
      {prompts[0] && (
        <PromptDialog
          key={prompts[0].id}
          prompt={prompts[0]}
          onSubmit={async (submittedAnswers) => {
            const current = prompts[0];
            await window.erkinode.invoke("prompt:answer", {
              id: current.id,
              answers: submittedAnswers,
            });
            setPrompts((prev) => prev.slice(1));
          }}
          onCancel={async () => {
            const current = prompts[0];
            await window.erkinode.invoke("prompt:answer", {
              id: current.id,
              answers: null,
            });
            setPrompts((prev) => prev.slice(1));
          }}
        />
      )}
      {toast && (
        <div className="toast" role="alert">
          <AlertCircle size={19} />
          <span>{toast}</span>
          <button
            title={translate("Dismiss notification")}
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
