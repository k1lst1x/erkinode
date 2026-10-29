# Credentials, trust, and backups

## Local encrypted storage

Saved passwords, private keys, and host data are encrypted on your device using Electron's system-backed secure storage. macOS uses Keychain, Windows uses DPAPI, and Linux requires a supported secure backend such as GNOME Keyring or KWallet.

If secure encryption is unavailable, Erkinode refuses to save rather than falling back to plaintext. Linux's `basic_text` fallback is explicitly rejected.

There is no project credential server or cloud synchronization service. SSH and SFTP connections go directly to the hosts you configure. Local commands run with your normal account permissions.

## Server trust

A server host key is separate from a user login key. Check first-connection fingerprints through an independent source. Treat changed host keys as something to investigate, not a prompt to dismiss.

For details, read [your first connection](../connections/) and the [architecture](../architecture/).

## Encrypted backups

Use the backup controls in Settings to export a portable, password-protected vault backup. Store the backup and its password securely. A backup is not a plaintext export; you need its password to restore it on another device.

Restoring replaces the current vault after confirmation. Close active remote connections first. The app does not synchronize conflicting edits between devices.

The `Erkinode` storage and credential-store identity is intentionally stable. Changing it after publication could orphan access to encrypted local data.

## Reporting problems

Never include a private key, password, vault, backup, terminal recording containing secrets, or full sensitive connection details in a public issue. A useful report describes the app version, OS, authentication method, steps, and redacted error text.

Code signing and notarization are not currently configured for beta artifacts. Checksums accompany release files, but do not establish publisher identity by themselves.
