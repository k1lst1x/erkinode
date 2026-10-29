import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  parseOsRelease,
  parsePosix,
  parseWindows,
  parseNetwork,
  parseLegacyRelease,
  detectRemoteSystem,
  probeExec,
  POSIX_PROBE,
} from "../electron/remote-system.js";
import { iconForSystem, systems } from "../shared/systems.js";

const posix = (kernel, release = "1.0", mac = "", platform = "") =>
  `__ERKINODE_KERNEL__\n${kernel}\n__ERKINODE_RELEASE__\n${release}\n__ERKINODE_MACOS__\n${mac}\n__ERKINODE_PLATFORM__\n${platform}\n`;

test("release identities cover registered distributions and derivative fallbacks without evaluating shell text", () => {
  for (const [id, definition] of Object.entries(systems).filter(
    ([, value]) => value.family === "linux",
  )) {
    const parsed = parseOsRelease(
      `ID=${id}\nPRETTY_NAME="${definition.name}"\nVERSION_ID="24.04"`,
    );
    assert.equal(parsed.id, id);
    assert.equal(parsed.family, "linux");
    assert.ok(iconForSystem(parsed));
  }
  const custom = parseOsRelease(
    'ID=customlinux\nID_LIKE="arch linux"\nPRETTY_NAME="Custom Linux"',
  );
  assert.equal(custom.name, "Custom Linux");
  assert.equal(iconForSystem(custom), "archlinux");
  assert.equal(
    parseOsRelease('ID=custom\nPRETTY_NAME="$(touch /tmp/never-execute-this)"')
      .name,
    "$(touch /tmp/never-execute-this)",
  );
  assert.equal(parseOsRelease("ID=__proto__").id, "__proto__");
  assert.equal(iconForSystem({ id: "__proto__", family: "linux" }), "linux");
  assert.equal(parseOsRelease("# ID=ubuntu\nSOMETHING=1"), null);
  assert.equal(parseOsRelease("ID=ubuntu\n" + "a".repeat(20000)), null);
  assert.equal(
    parseLegacyRelease(
      "Rocky Linux release 9.4 (Blue Onyx)",
      "/etc/redhat-release",
    ).id,
    "rocky",
  );
});

test("POSIX, Windows, hypervisor and network signatures identify supported families", () => {
  for (const [kernel, id] of [
    ["Darwin", "macos"],
    ["FreeBSD", "freebsd"],
    ["OpenBSD", "openbsd"],
    ["NetBSD", "netbsd"],
    ["DragonFly", "dragonfly"],
    ["SunOS", "solaris"],
    ["AIX", "aix"],
    ["HP-UX", "hpux"],
    ["VMkernel", "esxi"],
    ["QNX", "qnx"],
    ["MINIX", "minix"],
    ["Haiku", "haiku"],
  ]) {
    assert.equal(parsePosix(posix(kernel)).id, id);
  }
  assert.equal(parsePosix(posix("Darwin", "25.0", "26.1")).version, "26.1");
  assert.equal(
    parsePosix(posix("Linux", "6.8", "", "pve-manager/8.3.0/abcd")).id,
    "proxmox",
  );
  assert.equal(parsePosix(posix("Linux", "6.8", "", "15")).id, "android");
  assert.equal(
    parseWindows("Microsoft Windows [Version 10.0.20348.1]").family,
    "windows",
  );
  assert.equal(
    parseWindows(
      JSON.stringify({
        Caption: "Microsoft Windows Server 2022",
        Version: "10.0.20348",
      }),
    ).name,
    "Microsoft Windows Server 2022",
  );
  assert.equal(parseWindows("Windows command not found"), null);
  for (const [text, id] of [
    ["Junos OS 24.1", "junos"],
    ["Cisco IOS XE Software", "iosxe"],
    ["NX-OS version", "nxos"],
    ["MikroTik RouterOS", "routeros"],
    ["FortiGate", "fortios"],
    ["PAN-OS", "panos"],
    ["VMware ESXi", "esxi"],
    ["OPNsense", "opnsense"],
    ["pfSense", "pfsense"],
  ])
    assert.equal(parseNetwork(text).id, id);
  assert.equal(parsePosix("unrelated login banner"), null);
});

test("restricted exec-only targets fall back to Windows and unknown targets remain unknown", async () => {
  const commands = [];
  const client = {
    sftp(callback) {
      callback(new Error("SFTP disabled"));
    },
    exec(command, _options, callback) {
      commands.push(command);
      const stream = new PassThrough();
      stream.stderr = new PassThrough();
      callback(null, stream);
      setImmediate(() => {
        if (command === "cmd.exe /d /c ver")
          stream.write("Microsoft Windows [Version 10.0.20348.1]");
        stream.end();
        stream.emit("close");
      });
    },
  };
  const system = await detectRemoteSystem(client);
  assert.equal(system.id, "windows");
  assert.ok(commands.includes(POSIX_PROBE));
  assert.equal(
    await detectRemoteSystem({
      sftp: (cb) => cb(new Error("denied")),
      exec: (_c, _o, cb) => cb(new Error("denied")),
    }),
    null,
  );
});

test("probes bound output and time and release their channel on abort", async () => {
  let channel;
  const client = {
    exec(_command, _options, callback) {
      channel = new PassThrough();
      callback(null, channel);
    },
  };
  const pending = probeExec(client, "uname -s", { timeout: 100 });
  channel.write(Buffer.alloc(20 * 1024));
  assert.equal(await pending, null);
  assert.equal(channel.destroyed, true);
  const controller = new AbortController();
  const aborting = probeExec(client, "uname -s", { signal: controller.signal });
  controller.abort();
  assert.equal(await aborting, null);
  assert.equal(channel.destroyed, true);
  assert.equal(
    await probeExec({ exec() {} }, "uname -s", { timeout: 15 }),
    null,
  );
  const delayed = new EventEmitter();
  delayed.destroy = () => {
    delayed.wasDestroyed = true;
  };
  const late = probeExec(
    {
      exec(_c, _o, cb) {
        setTimeout(() => cb(null, delayed), 30);
      },
    },
    "uname -s",
    { timeout: 5 },
  );
  assert.equal(await late, null);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(delayed.wasDestroyed, true);
});
