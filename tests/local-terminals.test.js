import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { descendantPids } from "../electron/process-tree.js";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  LocalTerminals,
  shellProfile,
  terminalEnvironment,
} from "../electron/local-terminals.js";

test("local shell profiles use login shells and prefer PowerShell 7 on Windows", () => {
  assert.deepEqual(
    shellProfile("darwin", {}, { shell: "/bin/zsh" }, () => true),
    { file: "/bin/zsh", args: ["-l"] },
  );
  assert.equal(
    shellProfile(
      "linux",
      { SHELL: "relative" },
      { shell: "/missing" },
      (file) => file === "/bin/sh",
    ).file,
    "/bin/sh",
  );
  const core = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  assert.deepEqual(
    shellProfile("win32", {}, {}, (file) => file === core),
    { file: core, args: ["-NoLogo"] },
  );
  assert.match(
    shellProfile("win32", {}, {}, (file) => file.includes("WindowsPowerShell"))
      .file,
    /powershell.exe$/,
  );
  assert.throws(
    () => shellProfile("linux", {}, {}, () => false),
    /No local shell/,
  );
});
test("local terminal environment preserves user tools but excludes Electron injection flags", () => {
  const env = terminalEnvironment({
    PATH: "/tools",
    SSH_AUTH_SOCK: "/agent",
    ELECTRON_RUN_AS_NODE: "1",
    NODE_OPTIONS: "--inspect",
    NODE_PATH: "/app",
    ERKINODE_TEST_DATA: "/secret",
    TERM_PROGRAM: "old",
  });
  assert.equal(env.PATH, "/tools");
  assert.equal(env.SSH_AUTH_SOCK, "/agent");
  for (const key of [
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "NODE_PATH",
    "ERKINODE_TEST_DATA",
  ])
    assert.equal(env[key], undefined);
  assert.equal(env.TERM, "xterm-256color");
  assert.equal(env.TERM_PROGRAM, "Erkinode");
});
test("local sessions start lazily, bound output, resize, and dispose independently", () => {
  let onData,
    onExit,
    spawns = 0,
    killed = 0,
    paused = 0,
    resumed = 0,
    size;
  const emitted = [],
    written = [];
  const manager = new LocalTerminals({
    profile: { file: "/bin/sh", args: [] },
    emit: (event) => emitted.push(event),
    spawn: (_file, _args, options) => {
      spawns++;
      size = [options.cols, options.rows];
      return {
        onData: (fn) => {
          onData = fn;
          return { dispose() {} };
        },
        onExit: (fn) => {
          onExit = fn;
          return { dispose() {} };
        },
        write: (data) => written.push(data),
        pause: () => paused++,
        resume: () => resumed++,
        resize: (cols, rows) => {
          size = [cols, rows];
        },
        kill: () => killed++,
      };
    },
  });
  const first = manager.open(),
    second = manager.open();
  assert.notEqual(first.id, second.id);
  assert.equal(spawns, 0);
  manager.shell(first.id, 120, 40);
  manager.shell(first.id, 80, 25);
  assert.equal(spawns, 1);
  assert.deepEqual(size, [120, 40]);
  manager.input(first.id, "echo hi\r");
  assert.deepEqual(written, ["echo hi\r"]);
  assert.throws(() => manager.input(first.id, "x".repeat(65537)), /too large/);
  manager.resize(first.id, -1, 100000);
  assert.deepEqual(size, [120, 40]);
  manager.resize(first.id, 90, 35);
  assert.deepEqual(size, [90, 35]);
  onData("abc🙂".repeat(70000));
  assert.ok(paused > 0);
  for (const event of emitted) {
    assert.ok(event.bytes <= 65536);
    assert.doesNotMatch(event.data, /[\uD800-\uDBFF]$/);
    assert.doesNotMatch(event.data, /^[\uDC00-\uDFFF]/);
    manager.ack(first.id, event.bytes);
  }
  assert.ok(resumed > 0);
  onExit({ exitCode: 0 });
  assert.equal(manager.list()[0].status, "closed");
  assert.equal(manager.list()[1].status, "ready");
  assert.throws(() => manager.input(first.id, "no"), /closed/);
  manager.shell(second.id);
  manager.closeAll();
  assert.equal(killed, 1);
  assert.equal(manager.list().length, 0);
});
test("local shell startup errors remain inspectable and invalid folders are rejected", () => {
  const events = [];
  const manager = new LocalTerminals({
    emit: (event) => events.push(event),
    profile: { file: "/bin/sh", args: [] },
    spawn: () => {
      throw new Error("fixture failure");
    },
  });
  assert.throws(() => manager.open("relative"), /existing local folder/);
  const session = manager.open();
  assert.throws(() => manager.shell(session.id), /Could not start/);
  assert.equal(events[0].details, "fixture failure");
  assert.equal(manager.list()[0].status, "closed");
  manager.closeAll();
});
test(
  "real local PTY supports TTY input, cwd, resize, interrupt and exit",
  { skip: process.platform === "win32", timeout: 15000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "erkinode-local-"),
    );
    let output = "";
    const manager = new LocalTerminals({
      profile: { file: "/bin/sh", args: ["-i"] },
      home: directory,
      emit: (event) => {
        if (event.type === "data") {
          output += event.data;
          manager.ack(event.sessionId, event.bytes);
        }
      },
    });
    const session = manager.open();
    const waitFor = async (pattern) => {
      for (let i = 0; i < 200; i++) {
        if (pattern.test(output)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.match(output, pattern);
    };
    try {
      manager.shell(session.id, 110, 35);
      manager.input(
        session.id,
        "test -t 0 && test -t 1 && printf 'PTY_%s\\n' READY; pwd; stty size\r",
      );
      await waitFor(/PTY_READY/);
      await waitFor(/35 110/);
      assert.ok(output.includes(directory));
      manager.resize(session.id, 95, 28);
      manager.input(session.id, "stty size\r");
      await waitFor(/28 95/);
      manager.input(session.id, "sleep 30\r");
      await new Promise((resolve) => setTimeout(resolve, 150));
      manager.input(session.id, "\x03");
      manager.input(session.id, "printf 'INTERRUPT_%s\\n' OK\r");
      await waitFor(/INTERRUPT_OK/);
      manager.input(session.id, "exit\r");
      for (let i = 0; i < 100 && manager.list()[0].status !== "closed"; i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(manager.list()[0].status, "closed");
    } finally {
      manager.closeAll();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);

test("process-tree selection stays within the owned shell and orders children before parents", () => {
  const listing = "10 1\n20 10\n30 20\n40 10\n50 1\n60 50\n";
  assert.deepEqual(descendantPids(10, listing), [30, 40, 20]);
  assert.deepEqual(descendantPids(50, listing), [60]);
  assert.deepEqual(descendantPids(1, listing), []);
  assert.deepEqual(descendantPids(undefined, listing), []);
  assert.deepEqual(descendantPids(10, "20 10\n10 20\n20 20\ninvalid"), [20]);
});

// dash does not forward HUP to background jobs; bash and zsh generally do.
// Exercise each installed shell instead of assuming /bin/sh means bash.
for (const shell of process.platform === "win32"
  ? []
  : ["/bin/sh", "/bin/dash", "/bin/bash", "/bin/zsh"]) {
  const available = await fs.access(shell).then(
    () => true,
    () => false,
  );
  test(
    `closing a local ${shell} tab terminates its shell and active child job`,
    { skip: !available, timeout: 15000 },
    async () => {
      let output = "",
        child;
      const manager = new LocalTerminals({
        profile: { file: shell, args: ["-i"] },
        emit: (event) => {
          if (event.type === "data") {
            output += event.data;
            manager.ack(event.sessionId, event.bytes);
          }
        },
      });
      const session = manager.open();
      const state = (pid) => {
        try {
          return execFileSync("/bin/ps", ["-p", String(pid), "-o", "stat="], {
            encoding: "utf8",
            timeout: 1000,
            stdio: ["ignore", "pipe", "ignore"],
          }).trim();
        } catch {
          return "";
        }
      };
      const running = (pid) => {
        const value = state(pid);
        return value !== "" && !value.startsWith("Z");
      };
      try {
        manager.shell(session.id);
        const shellPid = manager.sessions.get(session.id).pty.pid;
        manager.input(
          session.id,
          "sleep 30 & printf 'CHILD_PID_%s\\n'  $! ; wait\r",
        );
        for (let i = 0; i < 250 && !/CHILD_PID_(\d+)/.test(output); i++)
          await new Promise((resolve) => setTimeout(resolve, 20));
        child = Number(output.match(/CHILD_PID_(\d+)/)?.[1]);
        assert.ok(child, output);
        assert.equal(
          running(child),
          true,
          "The fixture must start a real active job",
        );
        manager.close(session.id);
        for (let i = 0; i < 150 && (running(shellPid) || running(child)); i++)
          await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(
          running(shellPid),
          false,
          `Shell ${shellPid} remains in state ${state(shellPid)}`,
        );
        assert.equal(
          running(child),
          false,
          `Child ${child} remains in state ${state(child)}`,
        );
      } finally {
        manager.closeAll();
        if (child && running(child)) {
          try {
            process.kill(child, "SIGKILL");
          } catch {}
        }
      }
    },
  );
}
