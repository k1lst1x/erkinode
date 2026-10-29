import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Marked } from "marked";
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "_site");
let repository =
  process.env.SITE_REPOSITORY || process.env.GITHUB_REPOSITORY || "";
if (!repository) {
  try {
    repository =
      /github\.com[:/]([^/]+\/[^/\s]+?)(?:\.git)?$/.exec(
        execFileSync("git", ["remote", "get-url", "origin"], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
      )?.[1] || "";
  } catch {}
}
if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
  throw new Error("Invalid SITE_REPOSITORY; expected OWNER/REPOSITORY");
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const articles = [
  ["", "Overview", "site/content/overview.md"],
  ["installation", "Installation", "site/content/installation.md"],
  ["connections", "SSH connections", "site/content/connections.md"],
  ["terminal", "Local & remote terminals", "site/content/terminal.md"],
  ["files", "Files & SFTP", "site/content/files.md"],
  ["security", "Credentials & trust", "site/content/security.md"],
  ["troubleshooting", "Troubleshooting", "site/content/troubleshooting.md"],
  ["platforms", "Platform support", "docs/PLATFORMS.md"],
  ["remote-systems", "System detection", "docs/REMOTE_SYSTEMS.md"],
  ["localization", "Localization", "docs/LOCALIZATION.md"],
  ["architecture", "Architecture", "docs/ARCHITECTURE.md"],
  ["local-runtime", "Local terminal internals", "docs/LOCAL_TERMINAL.md"],
  ["development", "Contributing & development", "CONTRIBUTING.md"],
  ["publishing", "Publishing & releases", "docs/PUBLISHING.md"],
  ["versioning", "Versioning", "docs/VERSIONING.md"],
  ["validation", "Validation", "docs/VALIDATION.md"],
  ["open-source", "Open-source principles", "docs/OPEN_SOURCE.md"],
  ["storage-identity", "Storage identity", "docs/STORAGE_IDENTITY.md"],
  ["brand", "Brand & logo", "branding/README.md"],
  ["license", "Licenses", "LICENSE"],
  ["third-party", "Third-party notices", "THIRD_PARTY_NOTICES.md"],
  ["changelog", "Changelog", "CHANGELOG.md"],
];
const articlePath = (slug) => `docs/${slug ? slug + "/" : ""}index.html`;
const sourceMap = new Map(
  articles.map(([slug, , source]) => [source, articlePath(slug)]),
);
sourceMap.set("LICENSE-MIT", "LICENSE-MIT.txt");
sourceMap.set("LICENSE-APACHE", "LICENSE-APACHE.txt");
const relative = (from, to) => {
  const value = path.posix.relative(path.posix.dirname(from), to);
  return (value || "./").replace(/index\.html$/, "");
};
function layout(title, body, file = "index.html", docs = false) {
  const base = relative(file, "index.html") || "./";
  const repositoryUrl = repository ? `https://github.com/${repository}` : "";
  const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="description" content="Erkinode is a free, open-source SSH, SFTP, and local terminal workspace for macOS, Windows, and Linux."><meta name="theme-color" content="#101715"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; form-action 'none'"><title>${esc(title)} · Erkinode</title><link rel="icon" href="${base}assets/logo.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}assets/style.css"><script type="module" src="${base}assets/site.mjs"></script></head><body><a class="skip" href="#main">Skip to content</a><div class="container"><header class="nav"><a class="brand" href="${base}" aria-label="Erkinode home"><img src="${base}assets/logo.svg" alt="" width="36" height="36"><span class="brand-name">erkinode<span>.</span></span></a><nav aria-label="Main navigation"><a href="${base}#downloads">Download</a><a href="${base}docs/"${docs ? ' aria-current="page"' : ""}>Docs</a><a data-github>GitHub ↗</a></nav></header><main id="main">${body}</main><footer><span>Erkinode · Your servers. Your freedom.</span><div class="links"><a href="${base}docs/license/">MIT OR Apache-2.0</a><a data-github="/releases">Releases</a><a data-github>Source code ↗</a></div></footer></div></body></html>`;
  // Real links work without JavaScript too. Unconfigured local previews don't invent a remote.
  return document.replace(
    /<a([^>]*?)data-github(?:="([^"]*)")?([^>]*)>/g,
    (_all, before, suffix = "", after) =>
      `<a${before}data-github="${suffix}"${repositoryUrl ? ` href="${repositoryUrl}${suffix}"` : ' aria-disabled="true"'}${after}>`,
  );
}
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "assets"), { recursive: true });
for (const [source, target] of [
  ["site/style.css", "style.css"],
  ["site/site.mjs", "site.mjs"],
  ["site/downloads.mjs", "downloads.mjs"],
  ["site/assets/logo.svg", "logo.svg"],
])
  await fs.copyFile(
    path.join(root, source),
    path.join(output, "assets", target),
  );
const icon = (pathData) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#a5e8cc" d="${pathData}"/></svg>\n`;
const osPaths = JSON.parse(
  await fs.readFile(path.join(root, "src/assets/os/paths.json"), "utf8"),
);
await Promise.all([
  fs.writeFile(
    path.join(output, "assets/os-apple.svg"),
    icon(
      "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
    ),
  ),
  fs.writeFile(
    path.join(output, "assets/os-windows.svg"),
    icon(
      "M1 3.4 10.5 2v9H1V3.4Zm11 7.6V1.8L23 0v11H12ZM1 12.5h9.5v9L1 20.1v-7.6Zm11 0h11V24l-11-1.8v-9.7Z",
    ),
  ),
  fs.writeFile(path.join(output, "assets/os-linux.svg"), icon(osPaths.linux)),
]);
await fs.writeFile(
  path.join(output, "assets/config.json"),
  JSON.stringify({ repository, version: pkg.version }) + "\n",
);
await fs.writeFile(path.join(output, ".nojekyll"), "");
await fs.writeFile(
  path.join(output, "index.html"),
  layout(
    "Your servers. Your freedom.",
    await fs.readFile(path.join(root, "site/home.html"), "utf8"),
  ),
);
for (const [slug, title, source] of articles) {
  const file = articlePath(slug);
  const markdown = await fs.readFile(path.join(root, source), "utf8");
  const headings = new Map();
  const markdownParser = new Marked({ gfm: true });
  markdownParser.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const idBase = text
          .replace(/<[^>]+>/g, "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-|-$/g, "");
        const count = headings.get(idBase) || 0;
        headings.set(idBase, count + 1);
        return `<h${depth} id="${esc(idBase + (count ? `-${count}` : ""))}">${text}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        let url = href;
        if (/^(?:javascript|data|vbscript):/i.test(href)) url = "#";
        else if (
          !/^(?:https?:|mailto:|#)/.test(href) &&
          !href.endsWith("/") &&
          !href.startsWith("../../#")
        ) {
          const [pathname, hash] = href.split("#");
          const target = path.posix.normalize(
            path.posix.join(path.posix.dirname(source), pathname),
          );
          if (sourceMap.has(target))
            url =
              relative(file, sourceMap.get(target)) + (hash ? `#${hash}` : "");
          else if (repository)
            url =
              `https://github.com/${repository}/blob/main/${target}` +
              (hash ? `#${hash}` : "");
        }
        return `<a href="${esc(url)}"${title ? ` title="${esc(title)}"` : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  const nav = articles
    .map(
      ([item, label]) =>
        `<a href="${relative(file, articlePath(item))}"${slug === item ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
    )
    .join("");
  const sourceFile = path.posix.join(path.posix.dirname(file), "source.md");
  const toolbar = `<div class="doc-toolbar"><div class="eyebrow">DOCUMENTATION · ${esc(pkg.version)}</div><button class="copy-doc" type="button" data-copy-doc="${relative(file, sourceFile)}"><span class="copy-doc-icon" aria-hidden="true">{ }</span><span>Copy for AI agents</span></button></div>`;
  const docsMenu = `<aside class="docs-sidebar"><button class="docs-menu-toggle" type="button" aria-expanded="false" aria-controls="docs-menu-content"><span><small>Documentation</small><strong>${esc(title)}</strong></span><svg aria-hidden="true" viewBox="0 0 14 8" width="14" height="8"><path d="M1.5 1.5 7 6.5l5.5-5"/></svg></button><div class="docs-menu-content" id="docs-menu-content"><label for="docs-search">Find a guide</label><input id="docs-search" type="search" placeholder="Filter topics…" autocomplete="off"><nav class="docs-nav" aria-label="Documentation">${nav}</nav></div></aside>`;
  const body = `<div class="docs-layout">${docsMenu}<article class="doc">${toolbar}${await markdownParser.parse(source === "LICENSE" ? "# Licenses\n\n" + markdown : markdown)}${source === "LICENSE" ? `<p><a href="${relative(file, "LICENSE-MIT.txt")}">Full MIT license</a> · <a href="${relative(file, "LICENSE-APACHE.txt")}">Full Apache-2.0 license</a></p>` : ""}<div class="doc-source">${repository ? `<a href="https://github.com/${repository}/blob/main/${source}">View this page's source ↗</a>` : "Built from the project documentation."}</div></article></div>`;
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(output, file), layout(title, body, file, true)),
    fs.writeFile(path.join(output, sourceFile), markdown),
  ]);
}
for (const name of ["LICENSE-MIT", "LICENSE-APACHE"])
  await fs.copyFile(path.join(root, name), path.join(output, name + ".txt"));
await fs.writeFile(
  path.join(output, "404.html"),
  layout(
    "Page not found",
    '<section class="section"><div class="eyebrow">404</div><h1 class="section-title">This page isn’t here.</h1><p class="section-intro">Use your browser’s Back button, or open the project website from its GitHub repository.</p></section>',
  ),
);
console.log(
  `Website built: ${output} · ${articles.length} documentation pages · ${repository || "local preview (repository unconfigured)"}`,
);
