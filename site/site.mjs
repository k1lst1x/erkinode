import {
  detectPlatform,
  selectRelease,
  releaseDownloads,
} from "./downloads.mjs";
const config = await fetch(new URL("./config.json", import.meta.url)).then(
  (response) => response.json(),
);
const repository = config.repository;
const repositoryUrl = repository ? `https://github.com/${repository}` : null;
if (repositoryUrl)
  document.querySelectorAll("[data-github]").forEach((link) => {
    link.href = repositoryUrl + (link.dataset.github || "");
  });
const status = document.querySelector("#release-status");
const primary = document.querySelector("#primary-download");
const primaryLabel = document.querySelector("#primary-download-label");
const primaryIcon = document.querySelector("#primary-os-icon");
const downloadPicker = document.querySelector("#download-picker");
const downloadMenu = document.querySelector("#download-menu");
const deviceNote = document.querySelector("#device-note");
const labels = { mac: "macOS", win: "Windows", linux: "Linux" };
let hints = {};
try {
  hints =
    (await navigator.userAgentData?.getHighEntropyValues([
      "architecture",
      "bitness",
      "platform",
    ])) || {};
} catch {}
const detected = detectPlatform({
  userAgent: navigator.userAgent,
  platform:
    hints.platform || navigator.userAgentData?.platform || navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
  ...hints,
});
const currentCard = document.querySelector(`[data-os-card="${detected.os}"]`);
if (currentCard) {
  currentCard.classList.add("is-current");
  currentCard.setAttribute(
    "aria-label",
    `${labels[detected.os]} — your detected operating system`,
  );
  currentCard.querySelector(".os-match")?.removeAttribute("hidden");
}
if (labels[detected.os] && primaryIcon) {
  primaryIcon.src = new URL(
    `./os-${detected.os === "mac" ? "apple" : detected.os === "win" ? "windows" : "linux"}.svg`,
    import.meta.url,
  );
  primaryIcon.removeAttribute("hidden");
}
if (deviceNote)
  deviceNote.textContent =
    detected.os === "mobile"
      ? "Desktop app for macOS, Windows, and Linux. Choose a build below for your computer."
      : labels[detected.os]
        ? `${labels[detected.os]} detected${detected.arch !== "unknown" ? ` · ${detected.arch}` : ""}. You can always choose another build below.`
        : "Choose a build for your computer below.";
if (!status) {
  /* Documentation needs only repository links. */
} else if (!repository) {
  status.textContent =
    "Local preview. Release links will connect to this GitHub repository when deployed.";
  document.querySelectorAll("[data-download]").forEach((item) => {
    item.textContent = "Not published yet";
    item.removeAttribute("href");
    item.setAttribute("aria-disabled", "true");
  });
} else {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=30`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error("Releases unavailable");
    const release = selectRelease(await response.json());
    if (!release) {
      status.textContent =
        "The first desktop release has not been published yet. Source code and documentation are available now.";
      document.querySelectorAll("[data-download]").forEach((link) => {
        link.textContent = "Not published yet";
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
      });
    } else {
      const downloads = releaseDownloads(release, repository);
      status.textContent = `${release.tag_name} · ${release.prerelease ? "Beta release" : "Stable release"} · Downloads hosted on GitHub Releases`;
      document.querySelectorAll("[data-download]").forEach((link) => {
        const target = downloads[link.dataset.download];
        const asset = link.dataset.format === "zip" ? target.zip : target.asset;
        if (asset) {
          link.href = asset.browser_download_url;
          link.removeAttribute("aria-disabled");
          link.textContent = `${link.dataset.label} · ${Math.round(asset.size / 1024 / 1024)} MB`;
        } else {
          link.removeAttribute("href");
          link.textContent = "Not available in this release";
          link.setAttribute("aria-disabled", "true");
        }
      });
      document.querySelectorAll("[data-picker-download]").forEach((link) => {
        const target = downloads[link.dataset.pickerDownload];
        if (target?.asset) {
          link.href = target.asset.browser_download_url;
          link.removeAttribute("aria-disabled");
        } else {
          link.removeAttribute("href");
          link.setAttribute("aria-disabled", "true");
        }
      });
      const target = downloads[`${detected.os}-${detected.arch}`];
      if (primary && target?.asset) {
        primary.href = target.asset.browser_download_url;
        primaryLabel.textContent = `Download for ${target.label}`;
        primary.removeAttribute("aria-haspopup");
        primary.removeAttribute("aria-expanded");
        primary.querySelector(".download-chevron")?.remove();
      } else if (primary && labels[detected.os]) {
        primaryLabel.textContent = `Download for ${labels[detected.os]}`;
        configurePicker(
          [...downloadMenu.querySelectorAll("[data-picker-download]")].filter(
            (link) => link.dataset.pickerDownload.startsWith(`${detected.os}-`),
          ),
        );
      } else if (primary) {
        primaryLabel.textContent = "Choose desktop download";
        configurePicker([
          ...downloadMenu.querySelectorAll("[data-picker-download]"),
        ]);
      }
      const checksum = release.assets?.find(
        (asset) =>
          asset.name === "SHA256SUMS.txt" &&
          asset.state === "uploaded" &&
          asset.browser_download_url?.startsWith(
            `${repositoryUrl}/releases/download/`,
          ),
      );
      if (checksum) {
        const link = document.querySelector("#checksums");
        link.href = checksum.browser_download_url;
        link.hidden = false;
        const values = release.assets
          .filter(
            (asset) =>
              /^Erkinode-.+\.(?:dmg|zip|exe|AppImage)$/.test(asset.name) &&
              /^sha256:[a-f0-9]{64}$/i.test(asset.digest || ""),
          )
          .map((asset) => ({
            name: asset.name,
            hash: asset.digest.slice("sha256:".length),
          }));
        if (values.length) {
          const list = document.querySelector("#checksum-values");
          for (const value of values) {
            const row = document.createElement("div");
            row.className = "checksum-row";
            const name = document.createElement("span");
            name.className = "checksum-name";
            name.textContent = checksumLabel(value.name);
            const hash = document.createElement("code");
            hash.textContent = value.hash;
            const copy = document.createElement("button");
            copy.className = "hash-copy";
            copy.type = "button";
            copy.textContent = "Copy";
            copy.setAttribute("aria-label", `Copy SHA-256 for ${value.name}`);
            copy.addEventListener("click", () => copyText(value.hash, copy));
            row.append(name, hash, copy);
            list.append(row);
          }
          document
            .querySelector("#copy-all-hashes")
            ?.addEventListener("click", (event) =>
              copyText(
                values
                  .map((value) => `${value.hash}  ${value.name}`)
                  .join("\n"),
                event.currentTarget,
              ),
            );
          document.querySelector("#checksum-panel").removeAttribute("hidden");
        }
      }
    }
  } catch {
    status.textContent =
      "Release information is temporarily unavailable. View all downloads directly on GitHub Releases.";
    document.querySelectorAll("[data-download]").forEach((link) => {
      link.href = `${repositoryUrl}/releases`;
      link.textContent = "View on GitHub Releases";
    });
  }
}
function configurePicker(visibleLinks) {
  if (!primary || !downloadMenu || !downloadPicker) return;
  const allowed = new Set(visibleLinks);
  downloadMenu.querySelectorAll("[data-picker-download]").forEach((link) => {
    link.hidden = !allowed.has(link);
  });
  primary.href = "#downloads";
  primary.addEventListener("click", (event) => {
    event.preventDefault();
    const willOpen = downloadMenu.hidden;
    downloadMenu.hidden = !willOpen;
    primary.setAttribute("aria-expanded", String(willOpen));
    downloadPicker.classList.toggle("is-open", willOpen);
  });
  document.addEventListener("click", (event) => {
    if (downloadPicker.contains(event.target)) return;
    closePicker();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePicker();
  });
}
function closePicker() {
  if (!primary || !downloadMenu || !downloadPicker || downloadMenu.hidden)
    return;
  downloadMenu.hidden = true;
  primary.setAttribute("aria-expanded", "false");
  downloadPicker.classList.remove("is-open");
}
function checksumLabel(name) {
  if (name.endsWith("Windows-x64-Setup.exe")) return "Windows installer · x64";
  if (name.endsWith("Linux-x64.AppImage")) return "Linux AppImage · x64";
  if (name.endsWith("macOS-arm64.dmg")) return "macOS DMG · Apple Silicon";
  if (name.endsWith("macOS-arm64.zip")) return "macOS ZIP · Apple Silicon";
  if (name.endsWith("macOS-x64.dmg")) return "macOS DMG · Intel";
  if (name.endsWith("macOS-x64.zip")) return "macOS ZIP · Intel";
  return name;
}
async function copyText(value, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1800);
}
document.querySelectorAll("[data-copy-doc]").forEach((button) => {
  button.addEventListener("click", async () => {
    const label = button.querySelector("span:last-child");
    try {
      const response = await fetch(button.dataset.copyDoc);
      if (!response.ok) throw new Error("Documentation source unavailable");
      await navigator.clipboard.writeText(await response.text());
      label.textContent = "Copied for AI";
    } catch {
      label.textContent = "Copy failed";
    }
    setTimeout(() => {
      label.textContent = "Copy for AI agents";
    }, 1800);
  });
});
const search = document.querySelector("#docs-search");
search?.addEventListener("input", () => {
  const value = search.value.trim().toLowerCase();
  document.querySelectorAll(".docs-nav a").forEach((link) => {
    link.hidden = !link.textContent.toLowerCase().includes(value);
  });
});
const docsSidebar = document.querySelector(".docs-sidebar");
const docsMenuToggle = document.querySelector(".docs-menu-toggle");
if (docsSidebar && docsMenuToggle) {
  docsSidebar.classList.add("is-collapsible");
  docsMenuToggle.addEventListener("click", () => {
    const isOpen = docsSidebar.classList.toggle("is-open");
    docsMenuToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) search?.focus();
  });
}
