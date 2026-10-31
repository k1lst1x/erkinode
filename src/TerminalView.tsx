import { t as translate } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import {
  Clipboard,
  ClipboardPaste,
  Eraser,
  Files,
  KeyRound,
  LogOut,
  Search,
  TextCursorInput,
  X,
} from "lucide-react";
import type { Session, Snippet } from "./types";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export default function TerminalView({
  session,
  visible,
  fontSize,
  onError,
  snippets,
  onOpenSftp,
  onDisconnect,
}: {
  session: Session;
  visible: boolean;
  fontSize: number;
  onError: (s: string) => void;
  snippets: Snippet[];
  onOpenSftp: () => void;
  onDisconnect: () => void;
}) {
  const el = useRef<HTMLDivElement>(null),
    terminal = useRef<Terminal | null>(null),
    fit = useRef<FitAddon | null>(null),
    search = useRef<SearchAddon | null>(null),
    menuRef = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState(""),
    [sudoPasswordRequested, setSudoPasswordRequested] = useState(false),
    [menu, setMenu] = useState<{
      x: number;
      y: number;
      selection?: string;
      snippets?: boolean;
    } | null>(null),
    [notice, setNotice] = useState("");
  const errors = useRef(onError);
  errors.current = onError;
  const status = useRef(session.status);
  status.current = session.status;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1600);
  };
  const copySelection = async (textOverride?: string) => {
    const text = textOverride ?? (terminal.current?.getSelection() || "");
    if (!text) return;
    try {
      await window.erkinode.invoke("clipboard:write-text", text);
    } catch {}
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {}
    showNotice(translate("Text copied"));
  };
  const pasteText = (input: unknown) => {
    const text = typeof input === "string" ? input : String(input ?? "");
    if (!text) return;
    if (terminal.current) {
      try {
        terminal.current.focus();
        terminal.current.paste(text);
      } catch {
        const isBracketed = Boolean(terminal.current.modes?.bracketedPasteMode);
        const normalized = text.replace(/\r?\n/g, "\r");
        const data = isBracketed
          ? `\x1b[200~${normalized}\x1b[201~`
          : normalized;
        window.erkinode
          .invoke("session:input", { id: session.id, data })
          .catch((e) => errors.current(e.message));
      }
    } else {
      const normalized = text.replace(/\r?\n/g, "\r");
      window.erkinode
        .invoke("session:input", { id: session.id, data: normalized })
        .catch((e) => errors.current(e.message));
    }
    requestAnimationFrame(() => {
      terminal.current?.focus();
    });
    showNotice(translate("Text pasted"));
  };
  const pasteClipboard = async () => {
    let text: string | null = null;
    let invokeError: string | null = null;
    try {
      text = await window.erkinode.invoke<string | null>("clipboard:read-text");
    } catch (e) {
      invokeError = e instanceof Error ? e.message : String(e);
      text = null;
    }
    if ((typeof text !== "string" || text === "") && navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch {}
    }
    if (typeof text === "string" && text.length > 0) {
      pasteText(text);
      return;
    }
    try {
      terminal.current?.focus();
      const pasted = await window.erkinode.invoke<boolean>("clipboard:paste-native");
      if (pasted) {
        showNotice(translate("Text pasted"));
        return;
      }
    } catch {}

    if (invokeError) {
      errors.current(invokeError);
    } else {
      showNotice(translate("Clipboard is empty"));
    }
  };

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
      fontSize,
      scrollback: 10000,
      allowProposedApi: false,
      theme: {
        background: "#101416",
        foreground: "#d5e1de",
        cursor: "#a1e8ce",
        selectionBackground: "#365d55",
        black: "#1a2426",
        red: "#ef898c",
        green: "#a1e8ce",
        yellow: "#edd49a",
        blue: "#8db9f2",
        magenta: "#baa8f0",
        cyan: "#94dce0",
        white: "#d5e1de",
      },
    });
    const fitAddon = new FitAddon(),
      searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(el.current!);
    terminal.current = term;
    fit.current = fitAddon;
    search.current = searchAddon;
    term.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        (event.metaKey ||
          (event.ctrlKey && (event.shiftKey || event.altKey))) &&
        event.key.toLowerCase() === "t"
      )
        return false;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "f" &&
        event.type === "keydown"
      ) {
        setSearching(true);
        return false;
      }
      if (
        event.metaKey &&
        event.key.toLowerCase() === "k" &&
        event.type === "keydown"
      ) {
        term.clear();
        return false;
      }
      if (
        event.type === "keydown" &&
        ((event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "c") ||
          (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c"))
      ) {
        if (term.hasSelection()) {
          void copySelection(term.getSelection());
          return false;
        }
        if (event.metaKey) return false;
      }
      if (
        event.type === "keydown" &&
        ((event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "v") ||
          (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v"))
      ) {
        void pasteClipboard();
        return false;
      }
      return true;
    });
    const input = term.onData((data) => {
      if (status.current !== "ready") return;
      window.erkinode
        .invoke("session:input", { id: session.id, data })
        .catch((e) => errors.current(e.message));
    });
    const resize = term.onResize(({ cols, rows }) => {
      window.erkinode
        .invoke("session:resize", { id: session.id, cols, rows })
        .catch(() => {});
    });
    const off = window.erkinode.onEvent((event) => {
      if (event.sessionId !== session.id) return;
      if (event.type === "data" && event.data)
        term.write(event.data, () =>
          window.erkinode.ack(session.id, event.bytes || 0),
        );
      if (event.type === "sudo-password-request")
        setSudoPasswordRequested(true);
      if (event.type === "sudo-password-dismissed")
        setSudoPasswordRequested(false);
      if (event.type === "shell-closed")
        term.writeln(
          "\r\n\x1b[90m[" +
            translate("Shell exited. Close the tab or reconnect.") +
            "]\x1b[0m",
        );
      if (event.type === "status" && event.status === "closed")
        term.writeln(
          "\r\n\x1b[90m[" +
            translate(
              session.kind === "local"
                ? "Local terminal closed"
                : "Connection closed",
            ) +
            "]\x1b[0m",
        );
    });
    const observer = new ResizeObserver(() => {
      if (el.current?.clientWidth) {
        try {
          fitAddon.fit();
        } catch {}
      }
    });
    observer.observe(el.current!);
    return () => {
      off();
      input.dispose();
      resize.dispose();
      observer.disconnect();
      term.dispose();
      terminal.current = null;
    };
  }, [session.id]);
  useEffect(() => {
    if (session.status === "ready" && session.mode === "terminal") {
      try {
        fit.current?.fit();
      } catch {}
      window.erkinode
        .invoke("session:shell", {
          id: session.id,
          cols: terminal.current?.cols,
          rows: terminal.current?.rows,
        })
        .catch((e) => errors.current(e.message));
    }
  }, [session.status, session.mode, session.id]);
  useEffect(() => {
    if (terminal.current) terminal.current.options.fontSize = fontSize;
    if (visible) {
      requestAnimationFrame(() => {
        try {
          fit.current?.fit();
          terminal.current?.focus();
        } catch {}
      });
    }
  }, [visible, fontSize]);
  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        (menuRef.current === event.target ||
          menuRef.current.contains(event.target as Node))
      ) {
        return;
      }
      setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);
  return (
    <div
      className="terminal-view"
      onContextMenu={(event) => {
        event.preventDefault();
        const selection = terminal.current?.getSelection() || "";
        setMenu({
          x: Math.min(event.clientX, window.innerWidth - 250),
          y: Math.min(event.clientY, window.innerHeight - 350),
          selection,
        });
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        const selection = terminal.current?.getSelection() || "";
        setMenu({
          x: Math.min(event.clientX, window.innerWidth - 250),
          y: Math.min(event.clientY, window.innerHeight - 350),
          selection,
        });
      }}
    >
      <div className="terminal" ref={el} />
      {searching && (
        <div className="terminal-search">
          <Search size={15} />
          <input
            autoFocus
            aria-label={translate("Search terminal")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") search.current?.findNext(query);
              if (e.key === "Escape") setSearching(false);
            }}
          />
          <button
            onClick={() => setSearching(false)}
            aria-label={translate("Close search")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {sudoPasswordRequested && (
        <div className="sudo-password-offer" role="status">
          <KeyRound size={17} aria-hidden="true" />
          <div>
            <strong>{translate("sudo is requesting a password")}</strong>
            <small>
              {translate(
                "Use the SSH password for this connection, or enter it manually in the terminal.",
              )}
            </small>
          </div>
          <button
            className="primary"
            onClick={() => {
              window.erkinode
                .invoke("session:sudo-password", session.id)
                .catch((e) => errors.current(e.message));
            }}
          >
            {translate("Use SSH password")}
          </button>
          <button
            onClick={() => {
              setSudoPasswordRequested(false);
              window.erkinode
                .invoke("session:sudo-password-dismiss", session.id)
                .catch(() => {});
              terminal.current?.focus();
            }}
          >
            {translate("Enter manually")}
          </button>
        </div>
      )}
      {menu && (
        <div
          ref={menuRef}
          className="terminal-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {menu.snippets ? (
            <div className="terminal-menu-group">
              <button
                className="terminal-menu-item"
                onClick={() => setMenu({ ...menu, snippets: false })}
              >
                <span className="terminal-menu-icon">←</span>
                <span className="terminal-menu-label">{translate("Back")}</span>
              </button>
              <div className="terminal-menu-divider" />
              {snippets.length ? (
                snippets.map((snippet) => (
                  <button
                    key={snippet.id}
                    className="terminal-menu-item"
                    onClick={() => {
                      pasteText(snippet.command);
                      setMenu(null);
                    }}
                  >
                    <span className="terminal-menu-icon">
                      <TextCursorInput size={14} />
                    </span>
                    <span className="terminal-menu-label">{snippet.name}</span>
                  </button>
                ))
              ) : (
                <div className="terminal-menu-empty">
                  {translate("No snippets yet")}
                </div>
              )}
            </div>
          ) : (
            <div className="terminal-menu-group">
              <button
                className="terminal-menu-item"
                disabled={!menu.selection && !terminal.current?.hasSelection()}
                onClick={() => {
                  void copySelection(menu.selection);
                  setMenu(null);
                }}
              >
                <span className="terminal-menu-icon">
                  <Clipboard size={14} />
                </span>
                <span className="terminal-menu-label">{translate("Copy")}</span>
                <span className="terminal-menu-shortcut">
                  {isMac ? "⌘C" : "Ctrl+Shift+C"}
                </span>
              </button>
              <button
                className="terminal-menu-item"
                onClick={() => {
                  void pasteClipboard();
                  setMenu(null);
                }}
              >
                <span className="terminal-menu-icon">
                  <ClipboardPaste size={14} />
                </span>
                <span className="terminal-menu-label">
                  {translate("Paste")}
                </span>
                <span className="terminal-menu-shortcut">
                  {isMac ? "⌘V" : "Ctrl+Shift+V"}
                </span>
              </button>
              <button
                className="terminal-menu-item"
                onClick={() => {
                  setSearching(true);
                  setMenu(null);
                }}
              >
                <span className="terminal-menu-icon">
                  <Search size={14} />
                </span>
                <span className="terminal-menu-label">
                  {translate("Search")}
                </span>
                <span className="terminal-menu-shortcut">
                  {isMac ? "⌘F" : "Ctrl+F"}
                </span>
              </button>
              <button
                className="terminal-menu-item"
                onClick={() => setMenu({ ...menu, snippets: true })}
              >
                <span className="terminal-menu-icon">
                  <TextCursorInput size={14} />
                </span>
                <span className="terminal-menu-label">
                  {translate("Insert snippet")}
                </span>
                <span className="terminal-menu-arrow">›</span>
              </button>
              <div className="terminal-menu-divider" />
              <button
                className="terminal-menu-item"
                onClick={() => {
                  terminal.current?.clear();
                  terminal.current?.focus();
                  setMenu(null);
                }}
              >
                <span className="terminal-menu-icon">
                  <Eraser size={14} />
                </span>
                <span className="terminal-menu-label">
                  {translate("Clear terminal")}
                </span>
                <span className="terminal-menu-shortcut">
                  {isMac ? "⌘K" : "Ctrl+L"}
                </span>
              </button>
              {session.kind !== "local" && (
                <button
                  className="terminal-menu-item"
                  disabled={session.status !== "ready"}
                  onClick={() => {
                    onOpenSftp();
                    setMenu(null);
                  }}
                >
                  <span className="terminal-menu-icon">
                    <Files size={14} />
                  </span>
                  <span className="terminal-menu-label">
                    {translate("Open SFTP")}
                  </span>
                </button>
              )}
              <div className="terminal-menu-divider" />
              <button
                className="terminal-menu-item danger"
                onClick={() => {
                  onDisconnect();
                  setMenu(null);
                }}
              >
                <span className="terminal-menu-icon">
                  <LogOut size={14} />
                </span>
                <span className="terminal-menu-label">
                  {translate("Disconnect")}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
      {notice && (
        <div className="terminal-action-notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
