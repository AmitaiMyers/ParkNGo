// Fail-fast validation helpers used on every external input (API responses, JSON files, storage).

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function requireNumber(value: unknown, what: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${what} must be a finite number, got ${JSON.stringify(value)}`);
  return value;
}

export function requireString(value: unknown, what: string): string {
  assert(typeof value === 'string', `${what} must be a string, got ${JSON.stringify(value)}`);
  return value;
}

export function requireBoolean(value: unknown, what: string): boolean {
  assert(typeof value === 'boolean', `${what} must be a boolean, got ${JSON.stringify(value)}`);
  return value;
}

export function requireObject(value: unknown, what: string): Record<string, unknown> {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${what} must be an object`);
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown, what: string): unknown[] {
  assert(Array.isArray(value), `${what} must be an array`);
  return value;
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  assert(typeof value === 'string' && (allowed as readonly string[]).includes(value), `${what} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
  return value as T;
}

export function nullableString(value: unknown, what: string): string | null {
  return value === null ? null : requireString(value, what);
}

export function nullableNumber(value: unknown, what: string): number | null {
  return value === null ? null : requireNumber(value, what);
}

/** For fields the external schema marks optional: absent → null, present → must be a string. */
export function optionalString(record: Record<string, unknown>, key: string, what: string): string | null {
  return key in record ? requireString(record[key], what) : null;
}

/** For fields the external schema marks optional: absent → null, present → must be a number. */
export function optionalNumber(record: Record<string, unknown>, key: string, what: string): number | null {
  return key in record ? requireNumber(record[key], what) : null;
}
