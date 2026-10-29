const RELEASES_API =
  "https://api.github.com/repos/k1lst1x/erkinode/releases?per_page=20";
const RELEASE_URL_PREFIX = "https://github.com/k1lst1x/erkinode/releases/tag/";

export function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value)
      .replace(/^v/, "")
      .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!match) return null;
    return {
      numbers: match.slice(1, 4).map(Number),
      prerelease: match[4]?.split(".") || [],
    };
  };
  const a = parse(left),
    b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1)
    if (a.numbers[index] !== b.numbers[index])
      return Math.sign(a.numbers[index] - b.numbers[index]);
  if (!a.prerelease.length || !b.prerelease.length)
    return a.prerelease.length === b.prerelease.length
      ? 0
      : a.prerelease.length
        ? -1
        : 1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const x = a.prerelease[index],
      y = b.prerelease[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    if (xn && yn) return Math.sign(Number(x) - Number(y));
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function selectUpdate(currentVersion, releases) {
  const currentIsPrerelease = String(currentVersion).includes("-");
  const candidates = releases
    .filter(
      (release) =>
        !release.draft &&
        (currentIsPrerelease || !release.prerelease) &&
        typeof release.tag_name === "string" &&
        typeof release.html_url === "string" &&
        release.html_url.startsWith(RELEASE_URL_PREFIX),
    )
    .map((release) => ({
      release,
      version: release.tag_name.replace(/^v/, ""),
    }))
    .filter(({ version }) => compareVersions(version, currentVersion) === 1)
    .sort((a, b) => compareVersions(b.version, a.version) || 0);
  return candidates[0] || null;
}

export async function checkForUpdate(currentVersion, fetchImpl = fetch) {
  const response = await fetchImpl(RELEASES_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Erkinode update check",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error("Invalid GitHub response");
  const update = selectUpdate(currentVersion, releases);
  return update
    ? {
        available: true,
        currentVersion,
        latestVersion: update.version,
        url: update.release.html_url,
      }
    : { available: false, currentVersion };
}

export function isReleaseUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      /^\/k1lst1x\/erkinode\/releases\/tag\/v?[0-9A-Za-z.-]+$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}
