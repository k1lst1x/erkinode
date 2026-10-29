export type ParsedConnectionTarget =
  | { ok: false; reason: string }
  | {
      ok: true;
      address: string;
      port?: number;
      username?: string;
    };

export function parseConnectionTarget(input: unknown): ParsedConnectionTarget;
export function isValidHostAddress(value: unknown): boolean;
