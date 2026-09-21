const started = Date.now();

function stamp(): string {
  const secs = ((Date.now() - started) / 1000).toFixed(1).padStart(6, ' ');
  return `[${secs}s]`;
}

export const log = {
  info(msg: string): void {
    console.log(`${stamp()} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${stamp()} WARN  ${msg}`);
  },
  error(msg: string): void {
    console.error(`${stamp()} ERROR ${msg}`);
  },
  step(msg: string): void {
    console.log(`${stamp()} ── ${msg}`);
  },
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeCode =
      cause && typeof cause === 'object' && 'code' in cause
        ? ` (${String((cause as { code: unknown }).code)})`
        : '';
    return `${err.message}${causeCode}`;
  }
  return String(err);
}
