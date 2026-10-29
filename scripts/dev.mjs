import { spawn } from "node:child_process";
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Exit ${code}`)),
    );
  });
await run("tsc", ["--noEmit"]);
await run("vite", ["build"]);
await run("electron", ["."]);
