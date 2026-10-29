import { test } from "node:test";
import assert from "node:assert/strict";
import { describeConnectionFailure } from "../shared/connection-errors.js";

const host = { address: "server.example", port: 2222 };
const classify = (message, code, level) =>
  describeConnectionFailure({ message, code, level }, host);

test("connection failures are classified into actionable categories", () => {
  assert.equal(
    classify("getaddrinfo ENOTFOUND", "ENOTFOUND").code,
    "DNS_NOT_FOUND",
  );
  assert.equal(classify("temporary", "EAI_AGAIN").code, "DNS_TEMPORARY");
  assert.equal(classify("connect", "ECONNREFUSED").code, "CONNECTION_REFUSED");
  assert.equal(classify("connect", "ETIMEDOUT").code, "CONNECTION_TIMEOUT");
  assert.equal(classify("connect", "ENETUNREACH").code, "NETWORK_UNREACHABLE");
  assert.equal(classify("connect", "EHOSTDOWN").code, "NETWORK_UNREACHABLE");
  assert.equal(
    classify("socket hang up", "ECONNRESET").code,
    "CONNECTION_RESET",
  );
  assert.equal(
    classify("All configured authentication methods failed").code,
    "AUTH_FAILED",
  );
  assert.equal(
    classify("no matching key exchange algorithm").code,
    "SSH_INCOMPATIBLE",
  );
  assert.equal(classify("Could not parse private key").code, "INVALID_KEY");
  assert.equal(classify("Could not read SSH key").code, "INVALID_KEY");
  assert.equal(classify("SSH_AUTH_SOCK is missing").code, "AGENT_UNAVAILABLE");
  assert.equal(classify("SSH agent unavailable").code, "AGENT_UNAVAILABLE");
  assert.equal(
    classify("something unexpected").code,
    "UNKNOWN_CONNECTION_ERROR",
  );
});

test("friendly connection errors keep raw diagnostics separately", () => {
  const result = classify("getaddrinfo ENOTFOUND server.example", "ENOTFOUND");
  assert.match(result.message, /server\.example/);
  assert.equal(result.details, "getaddrinfo ENOTFOUND server.example");
});
