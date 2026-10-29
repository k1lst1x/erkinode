import sharp from "sharp";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
const folder = "build/icon.iconset";
await fs.mkdir(folder, { recursive: true });
for (const size of [16, 32, 128, 256, 512])
  for (const scale of [1, 2])
    await sharp("build/icon.svg")
      .resize(size * scale)
      .png()
      .toFile(`${folder}/icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`);
await sharp("build/icon.svg").resize(512).png().toFile("build/icon.png");
for (const variant of ["dark", "light"])
  await sharp(`branding/erkinode-wordmark-${variant}.svg`)
    .png()
    .toFile(`branding/erkinode-wordmark-${variant}.png`);
await sharp("branding/erkinode-symbol.svg")
  .resize(256)
  .png()
  .toFile("branding/erkinode-symbol.png");
execFileSync("/usr/bin/iconutil", [
  "-c",
  "icns",
  folder,
  "-o",
  "build/icon.icns",
]);
