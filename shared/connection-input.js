const invalid = (reason = "INVALID_ADDRESS") => ({ ok: false, reason });

function normalizeAddress(value) {
  if (!value || /[\s\0-\x1f]/.test(value)) return null;
  if (/[/?#]/.test(value)) return null;
  if (value.includes(":")) {
    try {
      const hostname = new URL(`http://[${value}]`).hostname;
      return hostname.slice(1, -1).toLowerCase();
    } catch {
      return null;
    }
  }
  if (/^\d+(?:\.\d+){3}$/.test(value)) {
    const parts = value.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255)
      ? parts.join(".")
      : null;
  }
  // Catch common IP typos such as 127.0.0.1abc without rejecting valid IDNs.
  if (/^\d{1,3}(?:\.\d{1,3}){2}\.[^.]*[^\d.][^.]*$/u.test(value)) return null;
  try {
    const hostname = new URL(`http://${value}`).hostname.replace(/\.$/, "");
    if (!hostname || hostname.length > 253 || hostname.includes("_"))
      return null;
    const labels = hostname.split(".");
    if (
      labels.some(
        (label) =>
          !label ||
          label.length > 63 ||
          !/^[a-z0-9-]+$/i.test(label) ||
          label.startsWith("-") ||
          label.endsWith("-"),
      )
    )
      return null;
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function parseConnectionTarget(input) {
  let value = String(input ?? "").trim();
  if (!value) return invalid();
  let address = "",
    username = "",
    port;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      const url = new URL(value);
      if (
        url.protocol !== "ssh:" ||
        url.password ||
        (url.pathname && url.pathname !== "/") ||
        url.search ||
        url.hash
      )
        return invalid("UNSUPPORTED_FORMAT");
      address = url.hostname.replace(/^\[|\]$/g, "");
      username = decodeURIComponent(url.username);
      port = url.port ? Number(url.port) : undefined;
    } else {
      if (/[/?#]/.test(value)) return invalid("UNSUPPORTED_FORMAT");
      const at = value.lastIndexOf("@");
      if (at >= 0) {
        if (at === 0 || value.indexOf("@") !== at) return invalid();
        username = value.slice(0, at);
        value = value.slice(at + 1);
      }
      const bracketed = /^\[([^\]]+)](?::(\d+))?$/.exec(value);
      if (bracketed) {
        address = bracketed[1];
        port = bracketed[2] ? Number(bracketed[2]) : undefined;
      } else {
        const withPort = /^([^:]+):(\d+)$/.exec(value);
        if (withPort) {
          address = withPort[1];
          port = Number(withPort[2]);
        } else address = value;
      }
    }
  } catch {
    return invalid("UNSUPPORTED_FORMAT");
  }
  const normalized = normalizeAddress(address);
  if (!normalized) return invalid();
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 1 || port > 65535)
  )
    return invalid("INVALID_PORT");
  if (
    username &&
    (!/^[^\s@]{1,128}$/u.test(username) || username.includes("\0"))
  )
    return invalid("INVALID_USERNAME");
  return {
    ok: true,
    address: normalized,
    ...(port === undefined ? {} : { port }),
    ...(username ? { username } : {}),
  };
}

export function isValidHostAddress(value) {
  const parsed = parseConnectionTarget(value);
  return parsed.ok && parsed.address === String(value).trim().toLowerCase();
}
