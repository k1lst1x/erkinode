# Platform support and packaging

The application shares its Electron/React/SSH2 code across operating systems. A macOS `.app` cannot run on Windows or Linux: each OS needs its own package and validation.

| Platform    | Configured output | Local validation                                 |
| ----------- | ----------------- | ------------------------------------------------ |
| macOS arm64 | `.app`, DMG, ZIP  | Build and desktop checks performed locally       |
| macOS x64   | `.app`, DMG, ZIP  | Configured; not tested on an Intel Mac here      |
| Windows     | NSIS `.exe`       | Configured; not tested on a Windows desktop here |
| Linux       | AppImage          | Configured; not tested on a Linux desktop here   |

The **Build desktop artifacts** workflow uses explicit native runners for macOS arm64/x64, Windows x64, and Linux x64. **Publish desktop release** reuses that build matrix, validates all six output files, and publishes them with checksums. See [publishing](PUBLISHING.md). Checks also use an OS matrix. These definitions are prepared locally; they are not evidence of completed remote CI runs. Runner architectures and target architectures are explicitly matched; separate desktop validation is still required for each.

Run `pnpm run dist` on the target OS. Public signing/notarization is not configured. macOS signing requires macOS. Cross-building has toolchain constraints; native runners keep the first release pipeline simpler. [electron-builder](https://www.electron.build/v26/docs/features/multi-platform-build/).

## OS-specific behavior

- macOS: Keychain-backed safeStorage; stable app identity is required across upgrades.
- Windows: DPAPI-backed safeStorage. Windows OpenSSH named-pipe agents need separate integration testing; current agent configuration uses SSH_AUTH_SOCK and is not a promise of native Windows-agent support.
- Linux: GNOME Keyring/KWallet or another supported secure backend must be available. The application rejects `basic_text` fallback rather than saving insecurely. A headless CI build does not validate a real desktop keyring.
- File permissions, symbolic links, path handling, native dialogs, installers, scaling, and shortcuts need testing on each OS. Remote paths remain POSIX-style; local paths use Node platform path utilities.

The independent OpenSSH fixture uses a macOS-specific executable and is optional; it does not validate Windows/Linux servers. Unit/integration fixtures are portable but do not replace installed desktop checks.

## Local terminal runtime

Local terminals use node-pty: native PTYs on macOS/Linux and ConPTY on Windows 10 1809 or later. Run `pnpm native:setup` after installing dependencies; this includes the Unix executable helper and builds from source where a matching prebuild is unavailable. See [setup and validation](LOCAL_TERMINAL.md). Current local desktop validation covers macOS arm64.

## Seeing local changes

`pnpm build` updates `dist/` only. `pnpm start` reads the existing build. `pnpm dev` builds once and launches the source app. `pnpm run pack` rebuilds the packaged application. Quit any running copy before opening a refreshed package. The current version is 0.1.0-beta.1, and the UI reads that exact value from package metadata.
