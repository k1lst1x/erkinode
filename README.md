# Erkinode

![Erkinode — Your servers. Your freedom.](branding/erkinode-wordmark-dark.svg)

**Your servers. Your freedom.**

A free, open-source SSH and SFTP desktop workspace, licensed under **MIT OR Apache-2.0**, at your option. No account, subscription, paid feature tier, advertising, or telemetry. The name combines Kazakh _erkin_ (free, unconstrained) with _node_.

Save your hosts, open SSH terminals, and manage remote files from one local application. An independent implementation inspired by common SSH workflows; no Termius code or branding is included.

**Status: 0.1.0-beta.2 desktop beta. Full Termius feature parity is not claimed.**

## Run on this Mac

Open `/Applications/Erkinode.app` after installation, or the `.app` in the current version’s `release/` folder. The packaged application does not require Node.js. You can copy it into `/Applications`.

Source changes do not update an existing `.app`. Run `pnpm run pack` to rebuild it, quit the old process, and reopen the rebuilt application. `pnpm dev` also builds once and launches Electron; restart it after editing. It is not a hot-reloading development server.

Local builds are not Apple Developer signed or notarized. Public releases require signing, notarization, and installer validation. Use the normal macOS Open flow if prompted; do not disable Gatekeeper globally.

Saving may trigger a system credential-store prompt. If secure encryption is unavailable, the application refuses to save rather than storing plaintext. Application identity and encrypted-storage identifiers are documented in [storage identity](docs/STORAGE_IDENTITY.md).

## Add your first host

1. Select **New host** (Cmd+N on macOS, Ctrl+N elsewhere). Enter a name, address, SSH port, and username.
2. Under **Authentication**, choose a password, private key, or SSH agent. Leave credentials blank to enter them on connection. Encrypted keys can use a saved or per-connection passphrase.
3. Optionally set a group, tags, notes, color, and jump host. Save.
4. Open **SSH** or **SFTP**. Verify the first SHA-256 host fingerprint with the administrator through an independent channel before trusting it.
5. A changed fingerprint blocks the connection. Investigate before removing the old fingerprint under **Keys and trust**.

If a saved password is rejected, use **Enter password again** in the failed connection tab for a one-time retry. This does not replace the saved password; edit the host to update it permanently. Connection errors and technical details remain visible until the tab is closed or retried.

A **jump host** is an intermediate SSH server for reaching a target on a private network. Add the intermediate server as a host, then select it in the target’s **Jump host** field. For an ordinary direct SSH connection, keep **Direct connection**.

You need an existing SSH/SFTP server and valid access credentials. Erkinode does not provision servers or bypass authentication.

## Local terminal

Choose **Local terminal** in the sidebar or press **Cmd+T** (macOS) / **Ctrl+Shift+T** (Windows/Linux). Each action opens an independent local shell in a new tab, starting in your home directory. Use **Open in folder…** in a local tab or **Cmd+Shift+T** (macOS) / **Ctrl+Alt+T** (Windows/Linux) to choose a starting directory.

Your default login shell runs on macOS/Linux; Windows uses PowerShell 7 if installed, then Windows PowerShell. Local and SSH tabs share terminal search, font settings, snippets, and split panes. Local tabs show **Running on this device** and have no SFTP or SSH tunneling controls. `exit` ends the shell; the closed tab offers a new local terminal. Closing the tab or app stops its shell. Commands execute with your normal account permissions, just as in the operating system terminal.

See [local terminal architecture and validation](docs/LOCAL_TERMINAL.md).

## Features

- Local interactive terminals with native PTYs, multiple tabs, folder selection, login-shell configuration, and native keyboard shortcuts.

- Automatic remote OS labels and icons after successful SSH authentication, with an encrypted last-seen cache. Linux distributions, macOS, Windows, BSD/Unix, and selected appliances are supported; restricted/unknown targets retain a generic icon. [Detection details](docs/REMOTE_SYSTEMS.md).

- Host creation, editing, deletion, groups, tags, notes, favorites, search, and grid/list views.
- Passwords, private keys, SSH_AUTH_SOCK agents, and keyboard-interactive authentication prompts.
- Native private-key import, Ed25519 generation, and public-key display.
- Explicit trust for unknown keys, SHA-256 pinning, rejection of changed keys, and jump chains with cycle detection.
- SSH tabs, two side-by-side connections, xterm.js, PTY resize, UTF-8/ANSI, scrollback, and terminal search. Terminals stay mounted when switching sections.
- SFTP navigation, hidden files, sizes, permissions, modification times, mkdir, rename, chmod, and confirmed deletion of files or empty directories.
- Local/remote file panes, recursive uploads/downloads, progress, cancellation, and temporary `.part` files. Up to two transfers run concurrently. Local access is limited to native folder grants; traversal and symlink escapes are blocked.
- Recursive transfers preserve folder structure and empty directories without following symlinks. Limits: 20,000 items and 64 levels. Existing destinations are not overwritten or merged. On cancellation, completed files remain and the current temporary file is removed.
- UTF-8 editor for files up to 1 MB, SHA-256 revision checks, and atomic replacement via OpenSSH POSIX rename. Saving is rejected if the extension is unavailable.
- Snippets insert text for review; they do not automatically press Enter.
- Local SSH tunnels bound to `127.0.0.1`, stopped explicitly or when their connection closes.
- Fully encrypted local vault using Electron safeStorage, plus portable password-protected backups using AES-256-GCM and scrypt.
- Context isolation, renderer sandbox, local custom protocol, CSP, allowlisted IPC, and sender validation. No runtime CDN scripts or cloud service.

## Beta limitations

- No drag-and-drop, transfer resume, or server-to-server copying. New files use mode 600 and directories 700. Recursive transfers do not preserve timestamps, ownership, ACLs, or archive attributes.
- No Mosh, Telnet, Serial, local PTY, SOCKS/HTTP proxy, remote/dynamic forwarding, agent forwarding, OpenSSH config import, or managed SSH certificates.
- No AI autocomplete, cloud sync, mobile clients, team vaults, collaborative terminals, session recording, saved workspaces, or automatic recovery after sleep.
- SSH agents must be available to the application process. FIDO2/hardware-key interoperability requires separate validation and is not claimed as supported.
- Up to 24 connections and eight jump nodes. The editor is not for large/binary files and does not preserve ownership/ACLs/xattrs on replacement. Revision checks reduce conflicts but are not a distributed lock between checking and renaming.
- SSH2 algorithm defaults apply; obsolete algorithms are not automatically enabled. Reconnection starts a new shell. Persistent remote shells need a server-side tool such as tmux or a different transport such as Mosh.
- No independent master-password or biometric app lock. Lock your operating-system session. At-rest encryption does not protect an already compromised, unlocked application process.
- Only macOS arm64 has been validated locally. Windows/Linux packaging and CI are configured, but those platforms require real desktop testing. Linux saves are blocked without a secure keyring.

## Development

Use Node.js 24 LTS and pnpm 11. Dependencies are pinned in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm native:setup
node node_modules/electron/install.js
pnpm dev
```

```sh
pnpm check          # TypeScript, production build, backend/integration tests
pnpm test:ui        # Electron E2E using a temporary SSH/SFTP fixture
pnpm run pack      # Packaged application directory for the current OS
pnpm run dist      # Installers/archives for the current OS
```

The optional SSH2 `cpu-features` native accelerator is not rebuilt; the JS implementation is used. On macOS, test independent OpenSSH interoperability with:

```sh
ERKINODE_OPENSSH_TEST=1 pnpm test
```

Fixtures use temporary files and loopback listeners, without changing Remote Login or system SSH configuration. E2E uses a separate temporary vault and test encryption provider; test mode is disabled in packaged builds.

## Structure

```text
electron/           Main process, encrypted vault, SSH/SFTP, transfers, IPC
src/                React/TypeScript interface and xterm.js
shared/             Remote system identities and icon selection
src/i18n/           React localization bindings
locales/            Shared English/Russian/Kazakh catalogs and translator runtime
tests/              Vault, SSH/SFTP, local access, OpenSSH interoperability
scripts/            Development, packaging, and UI checks
site/               Download website, browser OS detection, and user guides
docs/               Architecture, validation, platform and publishing guidance
.github/workflows/  Checks, native artifacts, public releases, and GitHub Pages
```

User data lives outside this repository. On macOS it is stored under `~/Library/Application Support/Erkinode/`. Never commit that folder, private keys, or backups.

## Publish

In GitHub Desktop, select this repository and choose **Publish repository**. Clear **Keep this code private** for public source access. Suggested description: `Free and open-source SSH & SFTP workspace. Your servers. Your freedom.`

The repository includes a GitHub Pages website with OS-aware downloads and 22 documentation pages. After publishing the repository, set **Settings → Pages → Source → GitHub Actions**. **Deploy website** publishes the site on main-branch changes; run it manually once if the first push preceded Pages setup. The deployment summary shows the exact URL, normally `https://OWNER.github.io/REPOSITORY/`, with docs under `/docs/`.

Run **Actions → Publish desktop release → Run workflow** to create installers for macOS Apple Silicon/Intel, Windows x64, and Linux x64. Only after all four native builds succeed does the publisher upload all seven installer/archive files plus SHA-256 checksums and make the release public. Windows releases include both an installer and a no-install portable executable. Beta versions publish as prereleases; the website supports them. Until a release exists, the site shows a clear publication notice. **Build desktop artifacts** remains available for a build without publication.

Code signing/notarization is not configured. The website distinguishes available artifacts from completed desktop validation. See the [publication guide](docs/PUBLISHING.md) and [platform support](docs/PLATFORMS.md).

## Documentation and license

English is the default and fallback language. Choose English, Русский, or Қазақша in **Settings → Language**; the choice is saved locally. The interface, native prompts, and application errors share bundled catalogs. Terminal output and user data are never translated. See [localization](docs/LOCALIZATION.md).

[Validation](docs/VALIDATION.md) records checks and their limits. `private: true` in package.json prevents accidental npm publication; it does not make a GitHub repository private.

Licensed under **MIT OR Apache-2.0**, at your option: [MIT](LICENSE-MIT), [Apache-2.0](LICENSE-APACHE), and [license overview](LICENSE). Commercial and closed-source forks are permitted under the selected terms. Free official releases are a product policy. Third-party components retain their own licenses.

[Contributing](CONTRIBUTING.md) · [Open-source principles](docs/OPEN_SOURCE.md) · [Architecture](docs/ARCHITECTURE.md) · [Brand](branding/README.md)

Release naming: [VERSIONING.md](docs/VERSIONING.md). Changes: [CHANGELOG.md](CHANGELOG.md).
