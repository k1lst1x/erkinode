# Erkinode validation

Current release target: **0.1.0-beta.2**.

Local validation environment: macOS arm64, Node.js 24, Electron 45. The application remains beta, and results from one machine do not establish support for every advertised platform.

## Automated coverage

The maintained validation suite covers:

- strict TypeScript checks and a Vite production build;
- encrypted vault persistence, secret redaction, rollback, schema validation, and authenticated portable backups;
- SSH authentication, host-key verification, PTY behavior, jump hosts, SFTP operations, transfers, conflict protection, and loopback tunnels;
- connection-input validation and actionable connection-error classification;
- local terminal creation, TTY input, resize, interruption, exit, and child-process cleanup;
- remote operating-system detection, bounded probes, caching, and safe fallbacks;
- English, Russian, and Kazakh catalog completeness, interpolation, and persisted language selection;
- Electron UI workflows for hosts, SSH, SFTP, local files, snippets, dialogs, errors, and local terminal tabs;
- website builds, local links and assets, download selection, release fallbacks, mobile layout, documentation navigation, and topic filtering;
- release metadata, tag/version consistency, exact installer sets, and SHA-256 checksum generation.

Temporary fixtures and screenshots use ignored directories and do not connect to real user servers or modify saved user credentials.

## Current local result

The current source passes TypeScript, the production build, 51 automated tests with one optional OpenSSH interoperability test skipped, Electron UI validation, local-terminal UI validation, locale validation, website build/check/browser validation, and macOS arm64 directory packaging.

The macOS package is not Apple Developer signed or notarized. Windows, Linux, and Intel Mac builds are configured in CI, but installed desktop validation on those platforms remains outstanding.

## Release gates still open

- Run the complete hosted CI matrix on macOS arm64, macOS x64, Windows x64, and Linux x64.
- Validate installed packages, native credential stores, native dialogs, scaling, shortcuts, and update behavior on every advertised platform.
- Test real-world failure modes including network loss, sleep/wake, slow links, large transfers, disk exhaustion, MFA, encrypted keys, IPv6, hardware agents, and bastion chains.
- Complete accessibility, keyboard navigation, clipboard, endurance, and resource-usage checks.
- Add platform code signing and notarization when project resources permit.
- Review release provenance, protected tags, protected environments, and immutable GitHub Action pins before every public release.

Full feature parity with commercial SSH clients is not claimed.
