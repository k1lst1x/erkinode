# Remote operating-system detection

After authentication and establishment of the first interactive shell or SFTP channel, Erkinode starts an optional background probe on separate channels. The primary channel always gets priority, including on servers with restrictive session limits. It does not type into the interactive terminal, change the remote system, install packages, or request elevated privileges.

## Identification

1. SFTP reads a small allowlist of release files such as `/etc/os-release`, `/usr/lib/os-release`, legacy distro release files, and supported appliance markers.
2. POSIX targets use fixed `uname` queries, with `sw_vers` for macOS and optional `pveversion`/Android `getprop` version queries.
3. Windows uses `cmd.exe /d /c ver`; PowerShell CIM can provide the product name/version, including Windows Server.
4. Supported network appliances can be recognized by `show version` or MikroTik's `/system resource print` when earlier probes cannot identify a conventional OS.

The release parser uses `ID`, `ID_LIKE`, `PRETTY_NAME`, and `VERSION_ID`. Release files are parsed as data; they are never sourced or evaluated as shell scripts. Command strings are fixed and never incorporate remote labels, host names, or user-supplied text. Login banners alone are not trusted as an exact distro identity.

The registry in `shared/systems.js` covers major Linux distributions and derivatives, macOS, Windows, BSD variants, Solaris/illumos, AIX, HP-UX, QNX, MINIX, Haiku, VMware ESXi, and common network/appliance families. A new Linux distribution can still display its release-file name and use its known `ID_LIKE` parent icon, or a generic Linux icon.

This is best-effort identification, not a claim to recognize every operating system ever made. Vendors may report their base distribution. Containers, chroots, and forced commands can expose the account's environment rather than the physical host. Unsupported or restricted targets keep the generic server icon. A known product may use a family/parent glyph when dedicated artwork is unavailable.

## Bounds and failure behavior

- Each output/release file is limited to 16 KiB. Labels, IDs, versions, and parent IDs are bounded and validated before caching.
- Every probe has a short timeout. Closing the SSH connection aborts the detector and closes its channels.
- Denied commands, missing SFTP, malformed output, timeout, and cache-write failure do not fail the SSH/SFTP session.
- No remote SVG, icon URL, or executable content is accepted. Icon geometry is bundled and selected from a local registry. Remote names are rendered as text.
- The result is cached with a timestamp inside the encrypted host vault. It remains visible while disconnected and is refreshed on later successful connections.
- Editing address, port, username, or jump host invalidates the cached identity. Results from a probe started before such an edit, or before host deletion, cannot overwrite the new host identity.

OS labels and icons are informational, not host-authentication evidence. Host-key verification remains independent and must still succeed.

## Artwork

`src/assets/os/paths.json` contains selected Simple Icons SVG paths; Windows uses an original generic window-pane glyph, and Unix/network fallbacks use Lucide. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for sources and individual licenses. Shapes are separate from Erkinode's own logo and licensing. No affiliation or endorsement is implied.

Regenerate the bundled subset with `pnpm icons:update`. Keep the pinned source version and notices in sync. No icon CDN is used at runtime.

## Verification

Tests cover distro and derivative mapping, POSIX/Windows/network signatures, non-evaluation of release text, output/time limits, cancellation, restricted targets, cache persistence/invalidation, and a real SSH/SFTP fixture. UI E2E checks that a successful connection updates the host card with its detected Ubuntu label and logo. Interoperability is also tested with local OpenSSH. Other OS signatures are fixture-tested; this does not replace real installed-platform/server QA.

Specification: [os-release](https://www.freedesktop.org/software/systemd/man/latest/os-release.html).
