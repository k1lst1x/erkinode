import { systems } from "../shared/systems.js";

const MAX_OUTPUT = 16 * 1024;
const clean = (value, max = 160) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const safeId = (value) =>
  clean(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
const result = (id, name, version = "", like = [], family = "linux") => ({
  id,
  name: clean(name || (Object.hasOwn(systems, id) ? systems[id].name : id)),
  version: clean(version, 80),
  like: like.map(safeId).filter(Boolean).slice(0, 8),
  family: Object.hasOwn(systems, id) ? systems[id].family : family,
});

/** Parse data, never source or evaluate the server's release file. */
export function parseOsRelease(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_OUTPUT)
    return null;
  const values = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const match =
      /^\s*(ID|ID_LIKE|NAME|PRETTY_NAME|VERSION_ID|DISTRIB_ID|DISTRIB_DESCRIPTION|DISTRIB_RELEASE)=(.*)$/.exec(
        line,
      );
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"'))
      value = value.slice(1, -1).replace(/\\(["\\$`])/g, "$1");
    else if (value.startsWith("'") && value.endsWith("'"))
      value = value.slice(1, -1);
    values[match[1]] = value;
  }
  const rawId = safeId(values.ID || values.DISTRIB_ID);
  const aliases = {
    archlinux: "arch",
    redhatenterpriseserver: "rhel",
    redhat: "rhel",
    amazon: "amzn",
    pop_os: "pop",
    suse: "opensuse",
    chromiumos: "chromeos",
  };
  const id = Object.hasOwn(aliases, rawId) ? aliases[rawId] : rawId;
  if (!id) return null;
  return result(
    id,
    values.PRETTY_NAME ||
      values.DISTRIB_DESCRIPTION ||
      values.NAME ||
      (Object.hasOwn(systems, id) ? systems[id].name : id),
    values.VERSION_ID || values.DISTRIB_RELEASE,
    (values.ID_LIKE || "").split(/\s+/),
  );
}

export function parseLegacyRelease(text, filename) {
  if (!text || Buffer.byteLength(text) > MAX_OUTPUT) return null;
  if (filename === "/etc/alpine-release")
    return result("alpine", "Alpine Linux", text);
  if (filename === "/etc/openwrt_release") return parseOsRelease(text);
  const release =
    /^(Red Hat Enterprise Linux|CentOS(?: Linux| Stream)?|Rocky Linux|AlmaLinux|Oracle Linux(?: Server)?)\s+(?:release\s+)?([\d.]+)/i.exec(
      text.trim(),
    );
  if (!release) return null;
  const id = /^Red Hat/i.test(release[1])
    ? "rhel"
    : /^CentOS/i.test(release[1])
      ? "centos"
      : /^Rocky/i.test(release[1])
        ? "rocky"
        : /^Alma/i.test(release[1])
          ? "almalinux"
          : "ol";
  return result(id, clean(text), release[2]);
}

export const POSIX_PROBE =
  "printf '__ERKINODE_KERNEL__\\n'; uname -s; printf '__ERKINODE_RELEASE__\\n'; uname -r; printf '__ERKINODE_MACOS__\\n'; if command -v sw_vers >/dev/null 2>&1; then sw_vers -productVersion; fi; printf '__ERKINODE_PLATFORM__\\n'; if command -v pveversion >/dev/null 2>&1; then pveversion; fi; if command -v getprop >/dev/null 2>&1; then getprop ro.build.version.release; fi; true";
function section(text, marker) {
  const match = new RegExp(
    `(?:^|\\r?\\n)__ERKINODE_${marker}__\\r?\\n([^]*?)(?=\\r?\\n__ERKINODE_|$)`,
  ).exec(text);
  return match ? clean(match[1]) : "";
}
export function parsePosix(text) {
  if (!text || Buffer.byteLength(text) > MAX_OUTPUT) return null;
  const kernel = section(text, "KERNEL"),
    version = section(text, "RELEASE"),
    platform = section(text, "PLATFORM");
  const pve = /pve-manager\/([\d.]+)/.exec(platform);
  if (pve) return result("proxmox", "Proxmox VE", pve[1]);
  if (kernel === "Linux" && /^\d+(?:\.\d+)*$/.test(platform))
    return result("android", "Android", platform);
  if (kernel === "Darwin")
    return result("macos", "macOS", section(text, "MACOS"), [], "macos");
  const unix = {
    Linux: "linux",
    FreeBSD: "freebsd",
    OpenBSD: "openbsd",
    NetBSD: "netbsd",
    DragonFly: "dragonfly",
    SunOS: "solaris",
    AIX: "aix",
    "HP-UX": "hpux",
    QNX: "qnx",
    MINIX: "minix",
    Haiku: "haiku",
    VMkernel: "esxi",
  };
  if (unix[kernel]) {
    const id = unix[kernel];
    return result(id, systems[id].name, version, [], "unix");
  }
  if (/^(CYGWIN|MINGW(?:32|64)?|MSYS)_NT/.test(kernel))
    return result("windows", "Windows", version, [], "windows");
  return null;
}
export function parseWindows(text) {
  if (!text || Buffer.byteLength(text) > MAX_OUTPUT) return null;
  try {
    const parsed = JSON.parse(text.trim());
    if (typeof parsed.Caption === "string" && /Windows/i.test(parsed.Caption))
      return result("windows", parsed.Caption, parsed.Version, [], "windows");
  } catch {}
  if (/Microsoft Windows/i.test(text)) {
    const version = /\b(\d+\.\d+(?:\.\d+){0,2})\b/.exec(text)?.[1] || "";
    return result("windows", "Windows", version, [], "windows");
  }
  return null;
}
export function parseNetwork(text) {
  if (!text || Buffer.byteLength(text) > MAX_OUTPUT) return null;
  const signatures = [
    [/JUNOS|Junos OS/i, "junos"],
    [/Cisco IOS XE/i, "iosxe"],
    [/NX-OS|Nexus Operating System/i, "nxos"],
    [/Cisco IOS Software|Cisco IOS\b/i, "ios"],
    [/Arista|Software image version:\s*4\./i, "eos"],
    [/RouterOS|MikroTik/i, "routeros"],
    [/FortiOS|FortiGate/i, "fortios"],
    [/PAN-OS|Palo Alto/i, "panos"],
    [/VMware ESXi/i, "esxi"],
    [/pfSense/i, "pfsense"],
    [/OPNsense/i, "opnsense"],
    [/TrueNAS/i, "truenas"],
    [/VyOS/i, "vyos"],
    [/EdgeOS/i, "edgeos"],
    [/OpenWrt/i, "openwrt"],
    [/OpenIndiana/i, "openindiana"],
    [/SmartOS/i, "smartos"],
    [/illumos/i, "illumos"],
    [/Oracle Solaris/i, "solaris"],
  ];
  for (const [pattern, id] of signatures)
    if (pattern.test(text))
      return result(id, systems[id].name, "", [], systems[id].family);
  return null;
}

/** Fixed, read-only probes. Bounded output and time, no PTY, no interpolation of remote/user data. */
export function probeExec(client, command, { signal, timeout = 1500 } = {}) {
  return new Promise((resolve) => {
    let channel,
      completed = false,
      bytes = 0;
    const chunks = [];
    const finish = (value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      channel?.destroy();
      resolve(value);
    };
    const cancel = () => finish(null),
      timer = setTimeout(cancel, timeout);
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      client.exec(command, { pty: false }, (error, stream) => {
        if (error) return finish(null);
        channel = stream;
        stream.on("error", cancel);
        if (completed) return stream.destroy();
        stream.stderr?.resume();
        stream.on("data", (chunk) => {
          const data = Buffer.from(chunk);
          bytes += data.length;
          if (bytes > MAX_OUTPUT) return cancel();
          chunks.push(data);
        });
        stream.on("close", () =>
          finish(Buffer.concat(chunks).toString("utf8")),
        );
      });
    } catch {
      cancel();
    }
  });
}
function probeReleaseFiles(client, signal) {
  return new Promise((resolve) => {
    let channel,
      stream,
      completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      stream?.destroy();
      channel?.end();
      resolve(value);
    };
    const cancel = () => finish(null),
      timer = setTimeout(cancel, 1800);
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    const files = [
      "/usr/local/opnsense/version/core",
      "/etc/platform",
      "/etc/rpi-issue",
      "/etc/os-release",
      "/usr/lib/os-release",
      "/etc/lsb-release",
      "/etc/redhat-release",
      "/etc/alpine-release",
      "/etc/openwrt_release",
      "/etc/release",
    ];
    try {
      client.sftp((error, sftp) => {
        if (error) return finish(null);
        channel = sftp;
        sftp.on("error", cancel);
        if (completed) return sftp.end();
        const next = () => {
          if (completed) return;
          const filename = files.shift();
          if (!filename) return finish(null);
          let bytes = 0,
            advanced = false;
          const chunks = [];
          const advance = () => {
            if (advanced || completed) return;
            advanced = true;
            next();
          };
          try {
            stream = sftp.createReadStream(filename);
          } catch {
            return advance();
          }
          stream.on("error", advance);
          stream.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_OUTPUT) return cancel();
            chunks.push(Buffer.from(chunk));
          });
          stream.on("end", () => {
            if (advanced || completed) return;
            const text = Buffer.concat(chunks).toString("utf8");
            const system =
              parseOsRelease(text) ||
              parseLegacyRelease(text, filename) ||
              parseNetwork(text) ||
              (filename === "/etc/rpi-issue" && /Raspberry Pi/i.test(text)
                ? result("raspios", "Raspberry Pi OS")
                : null);
            if (system) finish(system);
            else advance();
          });
        };
        next();
      });
    } catch {
      cancel();
    }
  });
}

export async function detectRemoteSystem(client, { signal } = {}) {
  const release = await probeReleaseFiles(client, signal);
  if (signal?.aborted) return null;
  if (release && !["debian", "linux"].includes(release.id)) return release;
  const posix = parsePosix(await probeExec(client, POSIX_PROBE, { signal }));
  if (signal?.aborted) return null;
  if (posix && ["proxmox", "android"].includes(posix.id)) return posix;
  if (release) return release;
  if (posix) return posix;
  const windows = parseWindows(
    await probeExec(client, "cmd.exe /d /c ver", { signal }),
  );
  if (signal?.aborted) return null;
  if (windows) {
    const detailed = parseWindows(
      await probeExec(
        client,
        'powershell.exe -NoProfile -NonInteractive -Command "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version | ConvertTo-Json -Compress"',
        { signal, timeout: 2200 },
      ),
    );
    return signal?.aborted ? null : detailed || windows;
  }
  for (const command of ["show version", "/system resource print"]) {
    const found = parseNetwork(
      await probeExec(client, command, { signal, timeout: 1200 }),
    );
    if (signal?.aborted) return null;
    if (found) return found;
  }
  return null;
}
