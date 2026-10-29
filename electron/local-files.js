import { t } from "./i18n.js";
import fs from "node:fs/promises";
import path from "node:path";
export class LocalFiles {
  constructor() {
    this.roots = new Set();
  }
  async grant(directory) {
    const real = await fs.realpath(directory);
    if (!(await fs.stat(real)).isDirectory())
      throw new Error(t("Choose a folder"));
    this.roots.add(real);
    return this.list(real);
  }
  async resolve(file) {
    if (typeof file !== "string" || file.includes("\0"))
      throw new Error(t("Invalid local path"));
    const real = await fs.realpath(file);
    if (
      ![...this.roots].some(
        (root) => real === root || real.startsWith(root + path.sep),
      )
    )
      throw new Error(t("Select this local folder in the system dialog first"));
    return real;
  }
  async list(directory) {
    const real = await this.resolve(directory);
    const root = [...this.roots].find(
      (root) => real === root || real.startsWith(root + path.sep),
    );
    const entries = await fs.readdir(real, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        try {
          const stat = await fs.lstat(path.join(real, entry.name));
          return {
            name: entry.name,
            directory: stat.isDirectory(),
            symlink: stat.isSymbolicLink(),
            size: stat.size,
            mode: stat.mode,
            modified: Math.floor(stat.mtimeMs / 1000),
          };
        } catch {
          return null;
        }
      }),
    );
    return { path: real, root, files: files.filter(Boolean) };
  }
}
