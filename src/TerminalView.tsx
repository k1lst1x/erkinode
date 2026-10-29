import { t as translate } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Search, X } from "lucide-react";
import type { Session } from "./types";

export default function TerminalView({
  session,
  visible,
  fontSize,
  onError,
}: {
  session: Session;
  visible: boolean;
  fontSize: number;
  onError: (s: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null),
    terminal = useRef<Terminal | null>(null),
    fit = useRef<FitAddon | null>(null),
    search = useRef<SearchAddon | null>(null);
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState("");
  const errors = useRef(onError);
  errors.current = onError;
  const status = useRef(session.status);
  status.current = session.status;
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
  return (
    <div className="terminal-view">
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
    </div>
  );
}
