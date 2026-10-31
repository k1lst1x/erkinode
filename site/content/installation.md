# Installation

Download the appropriate installer from the [home page](../../#downloads). Actual binaries live in GitHub Releases. The website shows only uploaded files; before the first release, it displays a publication notice instead of a broken download link.

## macOS

1. Open **Apple menu → About This Mac**. An Apple M-series chip means **Apple Silicon / arm64**. An Intel processor means **Intel / x64**.
2. Download the matching DMG. Open it and copy **Erkinode** into **Applications**.
3. Eject the mounted disk image, then open Erkinode from Applications.
4. After checking the installed app opens, you can remove the downloaded DMG. Do not delete the app from Applications.

A ZIP archive is also available. Extract the app and move it into Applications. Keep one active installed copy so Spotlight and the Dock do not launch an older build accidentally.

Beta macOS releases are not Developer ID signed or notarized. macOS may block an unverified app. Check that the download came from the project's GitHub release. Follow macOS's normal, per-app opening controls if you choose to run the build; do not turn off Gatekeeper globally. If macOS reports a damaged app or the wrong architecture, stop and check the artifact rather than bypassing protection blindly.

After attempting to open a trusted download once, macOS provides its per-app override under **System Settings → Privacy & Security → Open Anyway**. Use it only after comparing the checksum or verifying the GitHub attestation.

## Windows

Download the **Windows x64 Setup.exe** file and run the installer. Beta installers are not yet code signed, so SmartScreen may show an unrecognized-publisher notice. Verify the project and release source before continuing.

The **Windows x64 Portable.exe** build runs without installation or administrator access. It still keeps encrypted credentials in the current Windows user profile rather than beside the executable. Updates are manual.

For a verified download, SmartScreen's **More info** view offers **Run anyway**. Do not disable SmartScreen system-wide. If the filename, checksum, or source differs from the official GitHub release, do not run the installer.

The local terminal uses PowerShell 7 in its conventional installation location when available, otherwise Windows PowerShell. The current release pipeline does not provide a native Windows ARM64 installer.

## Linux

Download the **Linux x64 AppImage**. Make the downloaded file executable, then run it. Replace the version below with the filename you downloaded:

```sh
chmod +x Erkinode-VERSION-Linux-x64.AppImage
./Erkinode-VERSION-Linux-x64.AppImage
```

AppImage integration and FUSE dependencies vary by distribution. Consult your distribution's AppImage instructions if it does not start. Run Erkinode as your regular user; do not disable Chromium's sandbox or launch it as root to work around an installation problem.

GNOME Keyring, KWallet, or another supported secure credential store is required to save secrets. Erkinode rejects plaintext credential-store fallbacks. Native ARM64 and 32-bit Linux builds are not currently provided.

## Verify a download

Each release workflow publishes `SHA256SUMS.txt` alongside the installers. Download it and compare the entry for the file you downloaded. For example:

```sh
# macOS
shasum -a 256 Erkinode-VERSION-macOS-arm64.dmg

# Linux
sha256sum Erkinode-VERSION-Linux-x64.AppImage
```

```powershell
# Windows PowerShell
Get-FileHash .\Erkinode-VERSION-Windows-x64-Setup.exe -Algorithm SHA256
```

Checksums detect corruption or mismatches. They are not a substitute for code signing or verifying that you are on the real repository.

## Verify build provenance

GitHub also records a signed build-provenance attestation for every installer and for `SHA256SUMS.txt`. With [GitHub CLI](https://cli.github.com/) installed, verify any downloaded file with:

```sh
gh attestation verify Erkinode-VERSION-Linux-x64.AppImage --repo k1lst1x/erkinode
```

The successful result must identify `k1lst1x/erkinode` and the release workflow. This proves that the exact bytes were produced by the repository's GitHub Actions workflow. It does not suppress SmartScreen or Gatekeeper.

## Updates and existing data

Quit the running application before replacing it with a newer build. Your saved vault is kept outside the application bundle. On macOS it is stored under `~/Library/Application Support/Erkinode/`.

Make an encrypted backup before major changes or moving devices. See [credentials and trust](../security/).
