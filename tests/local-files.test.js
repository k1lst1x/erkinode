import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalFiles } from "../electron/local-files.js";
test("local file access requires native grant and rejects symlink escapes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "erkinode-local-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const allowed = path.join(root, "allowed"),
    outside = path.join(root, "outside");
  await fs.mkdir(allowed);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(allowed, "file.txt"), "hello");
  const local = new LocalFiles();
  await assert.rejects(local.list(allowed), /Select/);
  const result = await local.grant(allowed);
  assert.equal(result.files[0].name, "file.txt");
  await assert.rejects(local.list(outside), /Select/);
  await fs.symlink(
    outside,
    path.join(allowed, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(local.list(path.join(allowed, "escape")), /Select/);
  await assert.rejects(local.list(path.join(allowed, "..")), /Select/);
});
