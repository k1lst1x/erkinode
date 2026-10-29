import { z } from "zod";
import { isValidHostAddress } from "../shared/connection-input.js";
const text = (n = 200) => z.string().max(n);
export const systemSchema = z.object({
  id: z.string().regex(/^[a-z0-9._-]{1,80}$/),
  family: z.enum([
    "linux",
    "macos",
    "windows",
    "bsd",
    "unix",
    "network",
    "hypervisor",
  ]),
  name: z.string().min(1).max(160),
  version: z.string().max(80).default(""),
  like: z
    .array(z.string().regex(/^[a-z0-9._-]{1,80}$/))
    .max(8)
    .default([]),
  detectedAt: z.string().datetime(),
});
export const hostSchema = z.object({
  id: z.string().uuid().optional(),
  name: text().min(1),
  address: text(253)
    .min(1)
    .refine(isValidHostAddress, "Enter a valid IP address or hostname"),
  port: z.number().int().min(1).max(65535).default(22),
  username: text(128).min(1),
  group: text().default(""),
  tags: z.array(text(40)).max(20).default([]),
  notes: text(8000).default(""),
  favorite: z.boolean().default(false),
  auth: z.enum(["password", "key", "agent"]).default("password"),
  password: text(16000).optional(),
  privateKey: text(65536).optional(),
  passphrase: text(16000).optional(),
  clearSecret: z.boolean().optional(),
  jumpId: z.string().uuid().or(z.literal("")).default(""),
  color: z.enum(["mint", "blue", "amber", "violet"]).default("mint"),
});
// Existing vaults must remain readable even if a newer release introduces
// stricter address validation. Invalid legacy addresses are corrected through
// the host editor, while every new save still uses hostSchema above.
export const storedHostSchema = hostSchema.extend({
  address: text(253)
    .min(1)
    .refine((value) => !/[\0-\x1f]/.test(value), "Invalid host address"),
});
export const snippetSchema = z.object({
  id: z.string().uuid().optional(),
  name: text().min(1),
  command: text(32000).min(1),
});
export const remotePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((s) => !s.includes("\0"), "Invalid path");
export const tunnelSchema = z.object({
  sessionId: z.string().uuid(),
  localPort: z.number().int().min(0).max(65535),
  targetHost: text(253).min(1),
  targetPort: z.number().int().min(1).max(65535),
});
export function publicHost(host) {
  const { password, privateKey, passphrase, clearSecret, ...rest } = host;
  return {
    ...rest,
    hasPassword: !!password,
    hasKey: !!privateKey,
    hasPassphrase: !!passphrase,
  };
}
