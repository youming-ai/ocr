// ponytail: global console wrappers — per-sourceLogger if log routing matters.
export const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO]`, msg, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN]`, msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR]`, msg, ...args),
  debug: (msg: string, ...args: unknown[]) => console.log(`[DEBUG]`, msg, ...args),
  trace: (msg: string, ...args: unknown[]) => console.log(`[TRACE]`, msg, ...args),
};
