import { execFileSync } from "node:child_process";

/** Descendants only, deepest first. Never signal the parent app or unrelated jobs. */
export function descendantPids(root, listing) {
  if (!Number.isSafeInteger(root) || root <= 1) return [];
  const children = new Map();
  for (const line of listing.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]),
      parent = Number(match[2]);
    if (pid <= 1 || pid === parent) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(pid);
  }
  const visited = new Set([root]),
    result = [];
  for (const parent of visited) {
    for (const pid of children.get(parent) || []) {
      if (visited.has(pid)) continue;
      visited.add(pid);
      result.push(pid);
    }
  }
  return result.reverse();
}

export function terminatePty(pty) {
  if (!pty) return;
  if (
    process.platform !== "win32" &&
    Number.isSafeInteger(pty.pid) &&
    pty.pid > 1
  ) {
    try {
      // dash does not forward HUP to background jobs. Enumerate the owned tree
      // before terminating its shell, while parent/child relationships still exist.
      const listing = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], {
        encoding: "utf8",
        timeout: 1000,
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const pid of descendantPids(pty.pid, listing)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* Exited already or inaccessible. */
        }
      }
    } catch {
      /* Always try the native PTY shutdown even if ps is unavailable. */
    }
  }
  // ConPTY terminates its process tree itself on Windows.
  pty.kill();
}
