# Changelog

## 0.1.0-beta.2 — 2026-10-30

### Packaging

- Ad-hoc sign the complete macOS application bundle so unsigned beta builds retain valid code integrity on both Apple Silicon and Intel Macs.
- Verify the macOS bundle and its required Electron entitlements during CI before release artifacts are staged.

## 0.1.0-beta.1 — 2026-10-28

Initial beta release of Erkinode — a free, open-source SSH, SFTP, and local terminal desktop workspace.

### SSH & Remote Connections

- Secure SSH connections with host key verification (TOFU) and protection against changed remote host keys.
- Authentication via password, private keys (Ed25519, RSA, ECDSA), and native SSH agent (`SSH_AUTH_SOCK`).
- Interactive jump host (bastion) chaining with automatic cycle rejection.
- Port forwarding and local loopback tunnel management.
- Bounded, read-only remote operating system detection displaying distribution branding.

### Local Terminals

- Built-in local terminal tabs powered by native PTY.
- Automatic detection of user login shells (Zsh, Bash, Dash on macOS and Linux; PowerShell 7 / Windows PowerShell on Windows).
- Directory selection via native OS picker, split panes, and shell-friendly shortcut mapping.
- Clean process tree lifecycle management ensuring orphaned background child jobs terminate when closing tabs.

### SFTP & File Management

- Remote file browsing, permission management (`chmod`), creation, and deletion with safety confirmations.
- Conflict-protected text file editor with atomic remote saves.
- Reliable recursive folder and file transfers with progress metering, symlink safety checks, and refusal to overwrite existing destinations.
- Sandboxed local folder access requiring explicit OS dialog authorization.

### Security & Privacy

- Zero tracking, zero telemetry, and zero third-party cloud synchronization.
- Encrypted local vault backed by OS credential stores (macOS Keychain, Windows DPAPI, Linux Secret Service).
- Fallback plaintext storage on Linux (`basic_text`) is strictly rejected.
- Encrypted portable backups protected by AES-256-GCM and Scrypt key derivation.
- Sandboxed Electron renderer process with context isolation, strict Content Security Policy, and blocked remote navigations.

### Internationalization

- Complete interface, menu, and dialog translations for English, Russian, and Kazakh (`en`, `ru`, `kk`).
- Language preferences persisted in the encrypted vault.

### Packaging & Platforms

- Native packages for macOS (Apple Silicon `arm64` and Intel `x64` in DMG and ZIP formats).
- Windows installer (`x64` Setup.exe).
- Linux AppImage (`x64`).
- SHA-256 checksum manifests and GitHub build-provenance attestations for all release binaries.

The beta installers are not yet code signed or notarized. macOS arm64 has been tested locally; installed desktop validation on Windows, Linux, and Intel Mac remains in progress.
