import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidHostAddress,
  parseConnectionTarget,
} from "../shared/connection-input.js";

test("connection targets accept common SSH address formats", () => {
  assert.deepEqual(parseConnectionTarget("example.com"), {
    ok: true,
    address: "example.com",
  });
  assert.deepEqual(parseConnectionTarget("deploy@example.com:2222"), {
    ok: true,
    address: "example.com",
    port: 2222,
    username: "deploy",
  });
  assert.deepEqual(parseConnectionTarget("ssh://root@server.example:2200"), {
    ok: true,
    address: "server.example",
    port: 2200,
    username: "root",
  });
  assert.deepEqual(parseConnectionTarget("[2001:db8::1]:22"), {
    ok: true,
    address: "2001:db8::1",
    port: 22,
  });
  assert.deepEqual(parseConnectionTarget("2001:db8::1"), {
    ok: true,
    address: "2001:db8::1",
  });
});

test("connection targets reject typos, paths, unsupported schemes, and bad ports", () => {
  for (const value of [
    "127.0.0.1вй",
    "999.0.0.1",
    "server_name",
    "example.com/path",
    "https://example.com",
    "ssh://user:password@example.com",
    "example.com:0",
    "example.com:65536",
    "user@@example.com",
  ])
    assert.equal(parseConnectionTarget(value).ok, false, value);
});

test("stored host addresses must be normalized addresses, not connection strings", () => {
  assert.equal(isValidHostAddress("example.com"), true);
  assert.equal(isValidHostAddress("127.0.0.1"), true);
  assert.equal(isValidHostAddress("2001:db8::1"), true);
  assert.equal(isValidHostAddress("example.com:22"), false);
  assert.equal(isValidHostAddress("root@example.com"), false);
});
