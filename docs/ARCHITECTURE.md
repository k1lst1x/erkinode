# Erkinode architecture and contracts

## Modules

`electron/brand.js` defines the stable application and encrypted-storage identity. The `erkinode://` protocol, IPC channels, bundle ID, storage namespace, and backup format are compatibility contracts for future upgrades. See [STORAGE_IDENTITY.md](STORAGE_IDENTITY.md).

- `schema.js`: bounded host, snippet, tunnel, and path inputs. Host IDs are UUIDs; ports are 1–65535. Renderer state only contains redacted hosts.
- `vault.js`: serialized mutations, rollback on write failure, temporary file plus rename, and mode 0600. The encryption provider is injected. Disk format: `{version:1,ciphertext:base64}`; decrypted content: `{version,hosts,knownHosts,snippets,settings}`.
- `remote-system.js`: bounded, optional SSH/SFTP metadata probes after target authentication. See [remote systems](REMOTE_SYSTEMS.md).
- `local-terminals.js`: native local PTYs, login-shell selection, directory selection, independent session lifecycle, and flow control. The renderer cannot choose an executable or environment. See [local terminals](LOCAL_TERMINAL.md).
- `connections.js`: live SSH clients, jump-chain lifecycle, host verification, shell/SFTP channels, output backpressure, and tunnels. A session UUID is not a persistent remote terminal identifier.
- `transfer-manager.js`: streaming pipelines, temporary output, per-transfer AbortController, progress events, recursive plans, and two concurrent slots. File bytes do not pass through renderer IPC.
- `local-files.js`: native folder grants, canonical paths, and confinement to the chosen root. Symlinks cannot extend renderer access outside the root.
- `main.js`: native dialogs, OS encryption, windows, local scheme, allowlisted IPC, and shutdown.
- `preload.cjs`: only `invoke`, `onEvent`, and `ack`; no raw ipcRenderer, require, filesystem, or shell-execution API.
- `src/`: presentation state. Hidden terminals stay mounted; backend output is acknowledged after xterm processes it.

## Connection lifecycle

```text
open -> connecting -> [jump hops -> verify -> auth] -> ready
                         | reject/error/timeout       | shell channel
                         v                            | SFTP channel
                       closed                         | forwarding channels
                                                      v
                                                    closed
```

`ready` means transport/authentication succeeded. Shell creation is separate, so SFTP-only servers can work without a shell. Shell exit does not close SSH; SFTP remains available. Closing transport closes jump clients and related tunnels. Reconnection opens a new shell.

Output uses `StringDecoder('utf8')` across chunk boundaries. Backend pauses above 256 KiB of unacknowledged output and resumes below 64 KiB. Renderer acknowledges bytes after the `terminal.write` callback. Scrollback is limited to 10,000 lines and SSH sessions to 24; local terminal tabs have a separate limit of 32.

## IPC

Privileged calls use `{method,args}`. Main validates window identity, top-level frame, exact `erkinode://app/index.html` URL, and membership in the handler allowlist. Prototype names cannot resolve to handlers. Method-specific schemas validate arguments. Local paths originate from native Open/Save dialogs, not an arbitrary renderer filesystem API.

Events: `status`, `data`, `error`, `shell-closed`, `prompt`, `prompt-expired`, `transfer`. Prompts have random IDs and timeouts; unknown IDs do not authorize anything. Native fingerprint dialogs default to cancellation. Password entry is masked without autofill.

## Security invariants

1. Host metadata and credentials are never stored as plaintext in the production vault.
2. Changed pinned host keys cannot be bypassed by a connect-anyway button.
3. Trust for one endpoint must not silently replace another endpoint's identity.
4. Renderer code cannot directly access Node, local files, raw IPC, or arbitrary network operations.
5. Local file operations stay within explicit native folder grants.
6. Transfers avoid silent destination replacement; cancellation cleans the active temporary file.
7. Terminal output and remote filenames remain untrusted data, not executable HTML.
8. Credentials are excluded from renderer state, logs, and repository fixtures.

## File safety and format evolution

Remote editing compares revision digests and uses the OpenSSH POSIX rename extension. Absence of the extension rejects saving. The check/rename interval is not a distributed lock, and a malicious SFTP server can violate protocol expectations. File replacement does not preserve ownership, ACLs, or extended attributes.

Transfer no-replace behavior relies on compliant SFTP semantics; arbitrary malicious servers cannot be made transactional by the client.

Portable vault v1 has no migration engine. Format changes require an explicit version, old-format read tests, atomic migration, and a backup. Do not implement cloud sync by copying an OS-encrypted blob between devices.
