# Contributing to Erkinode

Erkinode is a free, local-first SSH and SFTP workspace. Contributions that make server access more reliable, accessible and understandable are welcome.

## Development

Use Node.js 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm native:setup
pnpm dev
```

Native PTY setup uses bundled N-API binaries on supported macOS/Windows architectures. Other targets need Python 3 and a C++ build toolchain. See [local terminal development](docs/LOCAL_TERMINAL.md).

Run `pnpm check` before proposing a change. For UI/IPC changes also run `pnpm test:ui`. For macOS interoperability use `ERKINODE_OPENSSH_TEST=1 pnpm test`. For packaging use `pnpm run pack`.

## Scope and quality

- Describe the problem, the expected behavior and the platforms you tested. Keep changes focused.
- Discuss large architectural changes before spending time on them.
- Treat terminal output, remote filenames, backup files and all IPC payloads as untrusted input.
- Keep Node/filesystem access out of the renderer. Do not relax sandbox, CSP, IPC sender checks or host-key verification.
- Never add production credentials, private keys, user vaults, terminal recordings or screenshots containing private server information.
- Use temporary local fixtures for tests. Do not require a public SSH server or change the host OS SSH settings.
- Test actual failure modes and data integrity. Keep unsupported functions explicit rather than adding placeholder controls.
- Do not silently rename storage namespaces, encryption identities or the backup format. They outlive branding and can strand encrypted user data.
- Keep the official local client usable without accounts, subscriptions, paid feature gates or telemetry.

## Licensing

The repository uses MIT OR Apache-2.0, at the recipient’s option. Unless explicitly stated otherwise, contributions intentionally submitted for inclusion are offered under both licenses so recipients can choose either. Only submit material you have the right to license on these terms. Third-party components retain their own licenses and notices. Do not copy code, logos, screenshots or assets from proprietary clients. Preserve dependency license notices.

## Branding

SVG sources and palette live in `branding/`. Explain visual changes with small screenshots or previews and keep the icon legible at 16–32 px.
