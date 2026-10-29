import fs from "node:fs";
import { pathToFileURL } from "node:url";
export function releaseMetadata(version, refType = "branch", refName = "main") {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("Invalid release version");
  const tag = `v${version}`;
  if (refType === "tag" && refName !== tag)
    throw new Error(`Tag ${refName} does not match package.json ${tag}`);
  return { version, tag, prerelease: version.includes("-") };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { version } = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url)),
  );
  const result = releaseMetadata(
    version,
    process.env.GITHUB_REF_TYPE,
    process.env.GITHUB_REF_NAME,
  );
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(result)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
    );
  console.log(JSON.stringify(result));
}
