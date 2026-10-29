import fs from "node:fs/promises";
import path from "node:path";
import { expectedReleaseFiles } from "./prepare-release.mjs";
const { version } = JSON.parse(
  await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const [platform, arch] = process.argv.slice(2);
const names = expectedReleaseFiles(version).filter((name) =>
  name.includes(
    `-${{ mac: "macOS", win: "Windows", linux: "Linux" }[platform]}-${arch}`,
  ),
);
if (!names.length || !["arm64", "x64"].includes(arch))
  throw new Error("Invalid installer target");
const directory = path.join("release", "staged");
await fs.rm(directory, { force: true, recursive: true });
await fs.mkdir(directory, { recursive: true });
for (const name of names) {
  let source = path.join("release", version, name);
  let stat = await fs.lstat(source).catch(() => null);
  if (!stat && name.includes("Linux-x64")) {
    const fallback = path.join(
      "release",
      version,
      name.replace("Linux-x64", "Linux-x86_64"),
    );
    const fallbackStat = await fs.lstat(fallback).catch(() => null);
    if (fallbackStat?.isFile() && fallbackStat.size > 0) {
      await fs.copyFile(fallback, source);
      stat = fallbackStat;
    }
  }
  if (!stat || !stat.isFile() || stat.size === 0)
    throw new Error(`Missing installer: ${name}`);
  await fs.copyFile(source, path.join(directory, name));
}
console.log(`Staged ${names.length} installer(s) for ${platform}/${arch}`);
