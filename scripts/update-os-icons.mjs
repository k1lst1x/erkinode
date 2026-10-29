import * as icons from "simple-icons";
import fs from "node:fs/promises";
import { systems } from "../shared/systems.js";
const selected = new Set(Object.values(systems).map((system) => system.icon));
const bySlug = new Map(
  Object.values(icons)
    .filter((icon) => icon?.slug)
    .map((icon) => [icon.slug, icon]),
);
const paths = {};
const notices = [
  "# Operating-system icon notices",
  "",
  "These logos identify remote systems; their use does not imply affiliation or endorsement. Trademark rights remain with their owners. Shapes are distributed separately from Erkinode source-code licensing.",
  "",
  "Source: [Simple Icons](https://github.com/simple-icons/simple-icons), pinned by pnpm-lock.yaml. The project uses CC0 unless an individual icon license below says otherwise. The Windows window-pane glyph is original generic artwork under the repository license; Unix/network fallbacks use Lucide icons.",
  "",
  "| Icon | Source | License |",
  "|---|---|---|",
];
for (const slug of [...selected].sort()) {
  if (["windows", "unix", "network"].includes(slug)) continue;
  const icon = bySlug.get(slug);
  if (!icon) throw new Error(`Missing icon: ${slug}`);
  if (icon.license?.type?.startsWith("GPL"))
    throw new Error(`Review this icon license separately: ${slug}`);
  paths[slug] = icon.path;
  const license = icon.license;
  notices.push(
    `| ${icon.title} | [Original source](${icon.source}) | ${license ? `[${license.type}](${license.url})` : "[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)"} |`,
  );
}
await fs.writeFile(
  "src/assets/os/paths.json",
  JSON.stringify(paths, null, 2) + "\n",
);
const runtimeNotices =
  "\n## Local terminal runtime\n\n[Microsoft node-pty](https://github.com/microsoft/node-pty), version 1.1.0, provides native pseudoterminals under the MIT license. Its copyright and full license are retained in the distributed `node_modules/node-pty/LICENSE` file. Windows uses the operating-system ConPTY implementation. This dependency does not change Erkinode's MIT OR Apache-2.0 licensing.\n";
await fs.writeFile(
  "THIRD_PARTY_NOTICES.md",
  notices.join("\n") +
    "\n\nCredit: Simple Icons contributors and the respective logo creators. The SVG path geometry is retained; the UI renders it in a single color. Attribution and applicable share-alike terms continue to apply to those icon assets.\n" +
    runtimeNotices,
);
await fs.copyFile(
  "node_modules/simple-icons/LICENSE.md",
  "src/assets/os/LICENSE-CC0.txt",
);
console.log(
  `Generated ${Object.keys(paths).length} OS icon paths and license notices.`,
);
