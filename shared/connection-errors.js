const rawMessage = (error) =>
  String(error?.message || error || "Unknown connection error");

const interpolate = (key, values = {}) =>
  key.replace(/{{(\w+)}}/g, (_match, name) => String(values[name] ?? ""));

export function describeConnectionFailure(error, host, t = interpolate) {
  if (error?.erkinodeFailure) return error.erkinodeFailure;
  const raw = rawMessage(error),
    code = String(error?.code || "").toUpperCase(),
    level = String(error?.level || "").toLowerCase(),
    details = raw,
    port = host?.port || 22,
    address = host?.address || "the server";
  if (
    level === "client-authentication" ||
    /all configured authentication methods failed|permission denied|authentication failed/i.test(
      raw,
    )
  )
    return {
      code: "AUTH_FAILED",
      message: t(
        "The server rejected the credentials for this user. Try entering the password again, or check the username and authentication method.",
      ),
      details,
    };
  if (code === "ENOTFOUND" || /getaddrinfo.*ENOTFOUND/i.test(raw))
    return {
      code: "DNS_NOT_FOUND",
      message: t(
        "Erkinode could not find {{address}}. Check the server address and DNS settings.",
        { address },
      ),
      details,
    };
  if (code === "EAI_AGAIN")
    return {
      code: "DNS_TEMPORARY",
      message: t(
        "DNS did not respond while looking up {{address}}. Check your network and try again.",
        { address },
      ),
      details,
    };
  if (code === "ECONNREFUSED" || /connection refused/i.test(raw))
    return {
      code: "CONNECTION_REFUSED",
      message: t(
        "Nothing is accepting SSH connections at {{address}} on port {{port}}. Check the server address, port, and SSH service.",
        { address, port },
      ),
      details,
    };
  if (
    code === "ETIMEDOUT" ||
    /timed? ?out|ready timeout|connection timeout/i.test(raw)
  )
    return {
      code: "CONNECTION_TIMEOUT",
      message: t(
        "The server did not respond. Check its status, port {{port}}, VPN, firewall, and network rules.",
        { port },
      ),
      details,
    };
  if (["EHOSTUNREACH", "EHOSTDOWN", "ENETUNREACH", "ENETDOWN"].includes(code))
    return {
      code: "NETWORK_UNREACHABLE",
      message: t(
        "The network cannot reach this server. Check your internet connection, VPN, routing, and firewall.",
      ),
      details,
    };
  if (
    ["ECONNRESET", "EPIPE"].includes(code) ||
    /connection reset|socket hang up|connection lost/i.test(raw)
  )
    return {
      code: "CONNECTION_RESET",
      message: t(
        "The server or network interrupted the connection. Check the server logs and try again.",
      ),
      details,
    };
  if (
    /no matching|handshake failed|unsupported.*algorithm|key exchange.*failed/i.test(
      raw,
    )
  )
    return {
      code: "SSH_INCOMPATIBLE",
      message: t(
        "The SSH client and server could not agree on compatible security algorithms. Check the server SSH configuration.",
      ),
      details,
    };
  if (/private key|SSH key|parsekey|key format/i.test(raw))
    return {
      code: "INVALID_KEY",
      message: t(
        "Erkinode could not use this private key. Check the key format and passphrase.",
      ),
      details,
    };
  if (
    /SSH_AUTH_SOCK|SSH agent (?:is )?unavailable|authentication agent/i.test(
      raw,
    )
  )
    return {
      code: "AGENT_UNAVAILABLE",
      message: t(
        "The SSH agent is unavailable. Start the agent, add the key, or choose another authentication method.",
      ),
      details,
    };
  if (/SSH connection closed|connection closed/i.test(raw))
    return {
      code: "CONNECTION_CLOSED",
      message: t(
        "The server closed the connection before the SSH session was ready. Check the server logs and try again.",
      ),
      details,
    };
  if (/jump host cycle|chain too long/i.test(raw))
    return {
      code: "CONFIGURATION_ERROR",
      message: raw,
      details,
    };
  return {
    code: "UNKNOWN_CONNECTION_ERROR",
    message: t(
      "Erkinode could not establish the SSH connection. Review the technical details and try again.",
    ),
    details,
  };
}
