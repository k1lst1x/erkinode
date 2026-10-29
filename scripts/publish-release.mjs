import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepareRelease } from "./prepare-release.mjs";
import { releaseMetadata } from "./release-meta.mjs";
const { version } = JSON.parse(
  await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const { tag, prerelease } = releaseMetadata(
  version,
  process.env.GITHUB_REF_TYPE,
  process.env.GITHUB_REF_NAME,
);
const repository = process.env.GITHUB_REPOSITORY;
if (
  !/^[\w.-]+\/[\w.-]+$/.test(repository || "") ||
  !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || "")
)
  throw new Error(
    "Publish only from a GitHub Actions checkout with a repository and commit",
  );
const directory = path.resolve("release-assets");
const names = await prepareRelease(directory, version);
const gh = (...args) =>
  execFileSync("gh", [...args, "--repo", repository], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
let existing;
try {
  existing = JSON.parse(gh("release", "view", tag, "--json", "isDraft"));
} catch (error) {
  if (!String(error.stderr).includes("release not found")) throw error;
}
if (existing && !existing.isDraft)
  throw new Error(
    `Release ${tag} is already public. Increment the version; do not replace published binaries.`,
  );
// If a tag exists already, it must identify the checked-out commit.
let taggedCommit;
try {
  taggedCommit = execFileSync(
    "git",
    ["rev-parse", "--verify", `${tag}^{commit}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
} catch {}
if (taggedCommit && taggedCommit !== process.env.GITHUB_SHA)
  throw new Error("The version tag points to a different commit");
if (!existing)
  gh(
    "release",
    "create",
    tag,
    "--target",
    process.env.GITHUB_SHA,
    "--title",
    `Erkinode ${version}`,
    "--notes-file",
    path.join(directory, "release-notes.md"),
    "--draft",
    ...(prerelease ? ["--prerelease"] : []),
  );
// Refresh a resumable draft to the exact commit and notes being published.
if (existing)
  gh(
    "release",
    "edit",
    tag,
    "--target",
    process.env.GITHUB_SHA,
    "--notes-file",
    path.join(directory, "release-notes.md"),
  );
gh(
  "release",
  "upload",
  tag,
  ...[...names, "SHA256SUMS.txt"].map((name) => path.join(directory, name)),
  "--clobber",
);
// Only the final operation makes the complete asset set public.
gh("release", "edit", tag, "--draft=false", `--prerelease=${prerelease}`);
console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
