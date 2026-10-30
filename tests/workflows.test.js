import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflowNames = ["build.yml", "check.yml", "pages.yml", "release.yml"];
const workflowDirectory = new URL("../.github/workflows/", import.meta.url);

test("external GitHub Actions are pinned to immutable commits", () => {
  for (const name of workflowNames) {
    const source = fs.readFileSync(new URL(name, workflowDirectory), "utf8");
    const references = [
      ...source.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm),
    ].map((match) => match[1]);

    for (const reference of references) {
      if (reference.startsWith("./")) continue;
      assert.match(
        reference,
        /^[^/@\s]+\/[^/@\s]+@[0-9a-f]{40}$/,
        `${name}: ${reference} must use a full commit SHA`,
      );
    }
  }
});

test("release publication requires main ancestry and a protected environment", () => {
  const source = fs.readFileSync(
    new URL("release.yml", workflowDirectory),
    "utf8",
  );

  assert.match(source, /git merge-base --is-ancestor/);
  assert.match(source, /refs\/remotes\/origin\/main/);
  assert.match(source, /environment:\s*\n\s+name: release/);
});

test("macOS releases are ad-hoc signed and verified before staging", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const source = fs.readFileSync(
    new URL("build.yml", workflowDirectory),
    "utf8",
  );

  assert.equal(manifest.build.mac.identity, "-");
  assert.equal(manifest.build.mac.hardenedRuntime, true);
  assert.match(source, /codesign --verify --deep --strict/);
  assert.match(source, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(source, /com\.apple\.security\.cs\.disable-library-validation/);
  assert.ok(
    source.indexOf("codesign --verify") <
      source.indexOf("scripts/stage-installers.mjs"),
    "macOS signature verification must run before artifacts are staged",
  );
});
