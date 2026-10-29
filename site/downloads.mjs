export const targets = [
  {
    id: "mac-arm64",
    os: "mac",
    arch: "arm64",
    label: "macOS · Apple Silicon",
    suffix: "macOS-arm64.dmg",
  },
  {
    id: "mac-x64",
    os: "mac",
    arch: "x64",
    label: "macOS · Intel",
    suffix: "macOS-x64.dmg",
  },
  {
    id: "win-x64",
    os: "win",
    arch: "x64",
    label: "Windows · x64",
    suffix: "Windows-x64-Setup.exe",
  },
  {
    id: "linux-x64",
    os: "linux",
    arch: "x64",
    label: "Linux · x64",
    suffix: "Linux-x64.AppImage",
  },
];
export function detectPlatform({
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
  architecture = "",
  bitness = "",
} = {}) {
  const text = `${platform} ${userAgent}`;
  if (
    /Android|iPhone|iPad|iPod|CrOS/i.test(text) ||
    (/Mac/i.test(text) && maxTouchPoints > 1)
  )
    return { os: "mobile", arch: "unknown" };
  const os = /Win/i.test(text)
    ? "win"
    : /Mac/i.test(text)
      ? "mac"
      : /Linux|X11/i.test(text)
        ? "linux"
        : "unknown";
  const arch =
    /arm|aarch64/i.test(architecture) || /arm64|aarch64/i.test(userAgent)
      ? "arm64"
      : (architecture === "x86" && bitness === "64") ||
          /x86_64|x64|Win64|WOW64|amd64/i.test(userAgent)
        ? "x64"
        : "unknown";
  // Intel in Safari's UA also appears on Apple Silicon; never treat it as proof.
  return { os, arch };
}
export function selectRelease(releases) {
  const candidates = (Array.isArray(releases) ? releases : []).filter(
    (release) =>
      !release.draft &&
      /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.tag_name || ""),
  );
  // Prefer a stable release; include beta releases while the project has no stable one.
  return (
    candidates.find((release) => !release.prerelease) || candidates[0] || null
  );
}
export function releaseDownloads(release, repository) {
  const version = release?.tag_name?.replace(/^v/, "");
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const prefix = `https://github.com/${repository}/releases/download/`;
  const safe = (asset) =>
    asset?.state === "uploaded" &&
    asset.size > 0 &&
    typeof asset.browser_download_url === "string" &&
    asset.browser_download_url.startsWith(prefix) &&
    !asset.browser_download_url.includes("?");
  const find = (suffix) =>
    assets.find(
      (asset) => asset.name === `Erkinode-${version}-${suffix}` && safe(asset),
    );
  return Object.fromEntries(
    targets.map((target) => [
      target.id,
      {
        ...target,
        asset: find(target.suffix) || null,
        zip:
          target.os === "mac" ? find(`macOS-${target.arch}.zip`) || null : null,
      },
    ]),
  );
}
