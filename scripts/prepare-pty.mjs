// Explicit native setup also supports installations with --ignore-scripts.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve("node-pty/package.json"));
const nativeDirectory = path.join(
  directory,
  "prebuilds",
  `${process.platform}-${process.arch}`,
);
if (
  !fs.existsSync(nativeDirectory) &&
  !fs.existsSync(path.join(directory, "build/Release/pty.node"))
) {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("node-gyp/bin/node-gyp.js"),
      "rebuild",
      "--directory",
      directory,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
if (process.platform !== "win32") {
  for (const candidate of [
    path.join(nativeDirectory, "spawn-helper"),
    path.join(directory, "build/Release/spawn-helper"),
  ]) {
    if (fs.existsSync(candidate)) fs.chmodSync(candidate, 0o755);
  }
}
require("node-pty");
console.log(
  "Local terminal native module ready:",
  process.platform,
  process.arch,
);
