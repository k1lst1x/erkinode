import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../_site");
async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true }))
    files.push(
      ...(entry.isDirectory()
        ? await walk(path.join(directory, entry.name))
        : [path.join(directory, entry.name)]),
    );
  return files;
}
let count = 0;
for (const file of (await walk(root)).filter((file) =>
  file.endsWith(".html"),
)) {
  const html = await fs.readFile(file, "utf8");
  if (!html.includes('<html lang="en">') || !/<title>[^<]+<\/title>/.test(html))
    throw new Error(`Missing language or title: ${file}`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1].replaceAll("&amp;", "&");
    if (/^(?:https?:|mailto:|data:|#)/.test(href)) continue;
    if (href.startsWith("/"))
      throw new Error(
        `Root-relative link breaks project Pages: ${href} in ${file}`,
      );
    const [pathname] = href.split(/[?#]/);
    let target = path.resolve(path.dirname(file), pathname || ".");
    const stat = await fs.stat(target).catch(() => null);
    if (stat?.isDirectory()) target = path.join(target, "index.html");
    if (!stat || !(await fs.stat(target).catch(() => null))?.isFile())
      throw new Error(`Broken local link: ${href} in ${file}`);
    count++;
  }
}
console.log(
  `Website check passed: ${count} local links/assets, project-relative paths, titles, and document languages.`,
);
