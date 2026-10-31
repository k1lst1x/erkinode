# Changelog

## 1.0.0 — 2026-10-31

### Terminal and SSH

- Add a terminal context menu on right-click or middle-click with Copy, Paste, Search, snippets, Clear, SFTP, and Disconnect actions.
- Confirm multiline clipboard pastes before they can execute terminal commands and show short copy/paste confirmations.
- Detect standard interactive `sudo` password prompts and offer an explicit choice between sending the in-memory SSH password and entering a password manually.
- Native local terminals alongside SSH sessions with login shells and full TTY support.

### Local security

- Add an optional six-digit PIN lock, disabled by default, with launch, sleep, manual, and configurable inactivity locking.
- Keep vault encryption anchored in the operating-system credential store; store only a salted Scrypt PIN verifier and rate-limit failed attempts.
- Close active connections and local shells whenever the workspace locks.
- Restore encrypted backups created with legacy markers while exporting a versioned, product-independent envelope.

### Packaging

- Publish a no-install Windows x64 portable executable alongside the existing installer, with checksums and build-provenance attestation.
- Ad-hoc sign the complete macOS application bundle so builds retain valid code integrity on both Apple Silicon and Intel Macs.


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
