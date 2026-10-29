import { t as translate } from "./i18n";
import { useRef, useState } from "react";
import {
  X,
  Server,
  KeyRound,
  ChevronRight,
  Upload,
  WandSparkles,
  Copy,
  Info,
} from "lucide-react";
import type { Host, HostInput } from "./types";
import { parseConnectionTarget } from "../shared/connection-input.js";
const empty: HostInput = {
  name: "",
  address: "",
  port: 22,
  username: "root",
  group: "",
  tags: [],
  notes: "",
  favorite: false,
  auth: "password",
  jumpId: "",
  color: "mint",
};
export default function HostDialog({
  host,
  hosts,
  close,
  saved,
  onError,
}: {
  host: Host | null;
  hosts: Host[];
  close: () => void;
  saved: () => void;
  onError: (s: string) => void;
}) {
  const [value, setValue] = useState<HostInput>(
      host ? { ...host } : { ...empty },
    ),
    [port, setPort] = useState(host ? String(host.port) : ""),
    [portInvalid, setPortInvalid] = useState(false),
    [addressInvalid, setAddressInvalid] = useState(false),
    [tab, setTab] = useState("connection"),
    [busy, setBusy] = useState(false),
    [publicKey, setPublicKey] = useState("");
  const [jumpHelpOpen, setJumpHelpOpen] = useState(false);
  const portInput = useRef<HTMLInputElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const set = (key: keyof HostInput, v: any) =>
    setValue((prev) => ({ ...prev, [key]: v }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const target = parseConnectionTarget(value.address);
    if (!target.ok) {
      setAddressInvalid(true);
      addressInput.current?.focus();
      return;
    }
    const normalizedPort = target.port ?? (port === "" ? 22 : Number(port));
    if (
      !Number.isInteger(normalizedPort) ||
      normalizedPort < 1 ||
      normalizedPort > 65535
    ) {
      setPortInvalid(true);
      portInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await window.erkinode.invoke("host:save", {
        ...value,
        address: target.address,
        username: target.username || value.username,
        port: normalizedPort,
      });
      saved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importKey() {
    try {
      const key = await window.erkinode.invoke<string | null>("key:import");
      if (key) set("privateKey", key);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function generate() {
    setBusy(true);
    try {
      const keys = await window.erkinode.invoke<{
        privateKey: string;
        publicKey: string;
      }>("key:generate");
      set("privateKey", keys.privateKey);
      setPublicKey(keys.publicKey);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <form className="dialog host-dialog" onSubmit={save}>
        <header>
          <div className="dialog-heading">
            <div className="icon-box mint">
              <Server size={24} />
            </div>
            <div>
              <h2>
                {host ? translate("Host settings") : translate("New host")}
              </h2>
              <p>
                {translate("Save a connection and reconnect with one click.")}
              </p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label={translate("Close")}>
            <X size={20} />
          </button>
        </header>
        <nav className="dialog-tabs">
          {[
            ["connection", translate("Connection")],
            ["auth", translate("Authentication")],
            ["details", translate("Organization")],
          ].map(([id, name], i) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <span>{i + 1}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="dialog-body">
          {tab === "connection" && (
            <>
              <label>
                {translate("Name")}
                <input
                  autoFocus
                  required
                  maxLength={200}
                  placeholder={translate("For example, Production API")}
                  value={value.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>
              <div className="fields-address">
                <div>
                  <label>
                    {translate("Host address")}
                    <input
                      ref={addressInput}
                      required
                      aria-label={translate("Host address")}
                      placeholder={translate(
                        "192.168.1.10 or server.example.com",
                      )}
                      value={value.address}
                      aria-invalid={addressInvalid || undefined}
                      aria-describedby={
                        addressInvalid ? "address-error" : undefined
                      }
                      onChange={(e) => {
                        set("address", e.target.value);
                        setAddressInvalid(false);
                      }}
                      onBlur={() => {
                        const target = parseConnectionTarget(value.address);
                        if (!target.ok) return;
                        set("address", target.address);
                        if (target.port !== undefined)
                          setPort(String(target.port));
                        if (target.username) set("username", target.username);
                      }}
                      spellCheck={false}
                    />
                  </label>
                  {addressInvalid && (
                    <span
                      className="field-error"
                      id="address-error"
                      role="alert"
                    >
                      {translate("Enter a valid IP address or hostname")}
                    </span>
                  )}
                </div>
                <label>
                  {translate("Port")}
                  <input
                    ref={portInput}
                    className="port-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    placeholder="22"
                    value={port}
                    aria-invalid={portInvalid || undefined}
                    aria-describedby={portInvalid ? "port-error" : undefined}
                    autoComplete="off"
                    onChange={(event) => {
                      setPort(
                        event.target.value.replace(/[^0-9]/g, "").slice(0, 5),
                      );
                      setPortInvalid(false);
                    }}
                    onBlur={() => {
                      if (!port) return;
                      const parsed = Number(port);
                      if (parsed >= 1 && parsed <= 65535)
                        setPort(String(parsed));
                    }}
                  />
                  {portInvalid && (
                    <span className="field-error" id="port-error" role="alert">
                      {translate("Use a port from 1 to 65535")}
                    </span>
                  )}
                </label>
              </div>
              <label>
                {translate("Username")}
                <input
                  required
                  placeholder={translate("ubuntu")}
                  value={value.username}
                  onChange={(e) => set("username", e.target.value)}
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
              <div className="jump-field">
                <div className="jump-field-heading">
                  <label htmlFor="jump-host-select">
                    {translate("Jump host")}{" "}
                    <span className="muted">({translate("optional")})</span>
                  </label>
                  <span
                    className="field-help"
                    onPointerEnter={() => setJumpHelpOpen(true)}
                    onPointerLeave={() => setJumpHelpOpen(false)}
                    onMouseEnter={() => setJumpHelpOpen(true)}
                    onMouseLeave={() => setJumpHelpOpen(false)}
                  >
                    <button
                      type="button"
                      className="field-help-button"
                      aria-label={translate("About jump hosts")}
                      aria-describedby={
                        jumpHelpOpen ? "jump-host-help" : undefined
                      }
                      aria-expanded={jumpHelpOpen}
                      onPointerEnter={() => setJumpHelpOpen(true)}
                      onPointerLeave={() => setJumpHelpOpen(false)}
                      onMouseEnter={() => setJumpHelpOpen(true)}
                      onMouseLeave={() => setJumpHelpOpen(false)}
                      onFocus={() => setJumpHelpOpen(true)}
                      onBlur={() => setJumpHelpOpen(false)}
                      onClick={() => setJumpHelpOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          setJumpHelpOpen(false);
                        }
                      }}
                    >
                      <Info size={14} aria-hidden="true" />
                    </button>
                    {jumpHelpOpen && (
                      <span
                        id="jump-host-help"
                        role="tooltip"
                        className="field-help-tooltip"
                      >
                        {translate(
                          "A jump host is an intermediate SSH server used to reach a private host. Keep Direct connection if your server is reachable directly.",
                        )}
                      </span>
                    )}
                  </span>
                </div>
                <select
                  id="jump-host-select"
                  aria-label={translate("Jump host")}
                  value={value.jumpId}
                  onChange={(e) => set("jumpId", e.target.value)}
                >
                  <option value="">{translate("Direct connection")}</option>
                  {hosts
                    .filter((h) => h.id !== host?.id)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} · {h.address}
                      </option>
                    ))}
                </select>
              </div>
              <div className="info-note">
                <KeyRound size={17} />
                <span>
                  {translate(
                    "Erkinode will ask you to verify the host fingerprint before your first connection.",
                  )}
                </span>
              </div>
            </>
          )}
          {tab === "auth" && (
            <>
              <label>
                {translate("Authentication method")}
                <select
                  value={value.auth}
                  onChange={(e) => set("auth", e.target.value)}
                >
                  <option value="password">{translate("Password")}</option>
                  <option value="key">{translate("Private SSH key")}</option>
                  <option value="agent">{translate("System SSH agent")}</option>
                </select>
              </label>
              {value.auth === "password" && (
                <>
                  <label>
                    {translate("Password")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        host?.hasPassword
                          ? translate("Saved · leave blank to keep")
                          : translate("Leave blank to prompt on connection")
                      }
                      value={value.password || ""}
                      onChange={(e) =>
                        set("password", e.target.value || undefined)
                      }
                    />
                  </label>
                  <p className="help">
                    {translate(
                      "Saved credentials are encrypted using the operating system credential store. On macOS, the encryption key is protected by Keychain.",
                    )}
                  </p>
                </>
              )}
              {value.auth === "key" && (
                <>
                  <div className="button-row">
                    <button type="button" onClick={importKey}>
                      <Upload size={16} />
                      {translate("Import key")}
                    </button>
                    <button type="button" disabled={busy} onClick={generate}>
                      <WandSparkles size={16} />
                      {translate("Generate Ed25519")}
                    </button>
                  </div>
                  <label>
                    {translate("Private key")}
                    <textarea
                      rows={4}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={
                        host?.hasKey
                          ? translate("Key saved · paste a new key to replace")
                          : "-----BEGIN OPENSSH PRIVATE KEY-----"
                      }
                      value={value.privateKey || ""}
                      onChange={(e) =>
                        set("privateKey", e.target.value || undefined)
                      }
                    />
                  </label>
                  <label>
                    {translate("Key passphrase")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        host?.hasPassphrase
                          ? translate("Saved · leave blank to keep")
                          : translate("If the key is encrypted")
                      }
                      value={value.passphrase || ""}
                      onChange={(e) =>
                        set("passphrase", e.target.value || undefined)
                      }
                    />
                  </label>
                  {publicKey && (
                    <div className="public-key">
                      <p>
                        {translate(
                          "Add the public key to ~/.ssh/authorized_keys on the server:",
                        )}
                      </p>
                      <textarea
                        readOnly
                        value={publicKey}
                        aria-label={translate("Public key")}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(publicKey)
                            .catch(() =>
                              onError(
                                translate("Select the public key and copy it"),
                              ),
                            );
                        }}
                      >
                        <Copy size={14} />
                        {translate("Copy")}
                      </button>
                      <p>
                        {translate(
                          "The private key is stored after you save the host. Create an encrypted backup.",
                        )}
                      </p>
                    </div>
                  )}
                </>
              )}
              {value.auth === "agent" && (
                <div className="info-note">
                  <KeyRound size={18} />
                  <span>
                    {translate(
                      "Erkinode uses SSH_AUTH_SOCK. Add your key with ssh-add before launching the app. Agent forwarding to the remote host is disabled.",
                    )}
                  </span>
                </div>
              )}
              {host && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!value.clearSecret}
                    onChange={(e) => set("clearSecret", e.target.checked)}
                  />
                  {translate("Remove all saved credentials for this host")}
                </label>
              )}
            </>
          )}
          {tab === "details" && (
            <>
              <label>
                {translate("Group")}
                <input
                  placeholder={translate("Production, Home lab, Work…")}
                  value={value.group}
                  onChange={(e) => set("group", e.target.value)}
                  list="groups"
                />
                <datalist id="groups">
                  {[...new Set(hosts.map((h) => h.group))]
                    .filter(Boolean)
                    .map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                </datalist>
              </label>
              <label>
                {translate("Tags")}{" "}
                <span className="muted">{translate("comma-separated")}</span>
                <input
                  placeholder={translate("linux, api, eu-west")}
                  value={value.tags.join(", ")}
                  onChange={(e) =>
                    set(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
              <label>
                {translate("Notes")}
                <textarea
                  rows={4}
                  placeholder={translate("What is this host used for?")}
                  value={value.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </label>
              <label>
                {translate("Color")}
                <div className="color-options">
                  {["mint", "blue", "amber", "violet"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      className={`${color} ${value.color === color ? "chosen" : ""}`}
                      onClick={() => set("color", color)}
                    />
                  ))}
                </div>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={value.favorite}
                  onChange={(e) => set("favorite", e.target.checked)}
                />
                {translate("Favorite")}
              </label>
            </>
          )}
        </div>
        <footer>
          <span className="secure-caption">
            <KeyRound size={14} />
            {translate("Encrypted on this device")}
          </span>
          <div>
            <button type="button" onClick={close}>
              {translate("Cancel")}
            </button>
            <button disabled={busy} type="submit" className="primary">
              {busy ? translate("Saving…") : translate("Save host")}
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
