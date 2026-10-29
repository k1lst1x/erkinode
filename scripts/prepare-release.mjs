import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { releaseMetadata } from "./release-meta.mjs";
export function expectedReleaseFiles(version) {
  releaseMetadata(version);
  return [
    "macOS-arm64.dmg",
    "macOS-arm64.zip",
    "macOS-x64.dmg",
    "macOS-x64.zip",
    "Windows-x64-Setup.exe",
    "Linux-x64.AppImage",
  ].map((suffix) => `Erkinode-${version}-${suffix}`);
}
export async function prepareRelease(directory, version) {
  const names = expectedReleaseFiles(version);
  const available = await fs.readdir(directory);
  const extras = available.filter(
    (name) =>
      !names.includes(name) &&
      !["SHA256SUMS.txt", "release-notes.md"].includes(name),
  );
  if (extras.length)
    throw new Error(`Unexpected release files: ${extras.join(", ")}`);
  const checksums = [];
  for (const name of names) {
    const file = path.join(directory, name),
      stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
      throw new Error(`Missing/invalid installer: ${name}`);
    const hash = createHash("sha256");
    const { createReadStream } = await import("node:fs");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    checksums.push(`${hash.digest("hex")}  ${name}`);
  }
  await fs.writeFile(
    path.join(directory, "SHA256SUMS.txt"),
    checksums.join("\n") + "\n",
  );
  await fs.writeFile(
    path.join(directory, "release-notes.md"),
    `# Erkinode ${version}\n\nSSH, SFTP, and local terminals in one free, open-source desktop app.\n\n## Downloads\n\n- macOS: choose Apple Silicon (arm64) or Intel (x64), in DMG or ZIP format.\n- Windows: x64 Setup.exe.\n- Linux: x64 AppImage.\n\n## Verify the download\n\nSHA256SUMS.txt contains the SHA-256 checksum for every installer. GitHub build-provenance attestations link every installer and the checksum manifest to this repository, workflow, and commit. Verify an installer with \`gh attestation verify FILE --repo ${process.env.GITHUB_REPOSITORY || "k1lst1x/erkinode"}\`.\n\n## Beta status\n\nInstallers are not yet platform code signed or notarized. GitHub attestations prove release origin but do not replace Authenticode, Apple Developer ID, SmartScreen, or Gatekeeper. macOS arm64 is tested locally; other desktop targets require further validation. Build/test success does not establish complete GUI compatibility on every target. Automatic in-app updates, cloud sync, and mobile applications are not implemented.\n\nSee the repository README and documentation for installation, known limitations, and source-build instructions. Source and original branding are licensed MIT OR Apache-2.0.\n`,
  );
  return names;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { version } = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const names = await prepareRelease(
    path.resolve(process.argv[2] || "release-assets"),
    version,
  );
  console.log(
    `Release ready: ${names.length} validated installers plus SHA256SUMS.txt`,
  );
}
