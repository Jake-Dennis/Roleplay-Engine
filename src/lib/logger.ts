// ANSI color codes for development
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
} as const;

const isDev = process.env.NODE_ENV === 'development';

// AsyncLocalStorage for request IDs (server-side only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let requestStorage: any = null;

if (!isDev && typeof window === 'undefined') {
  try {
    const asyncHooks = await import('node:async_hooks');
    requestStorage = new asyncHooks.AsyncLocalStorage();
  } catch {
    // async_hooks unavailable — request IDs fall back to explicit passing
  }
}

export function getCorrelationId(): string | undefined {
  return requestStorage?.getStore()?.requestId;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatDev(level: string, message: string, requestId?: string): string {
  const colorMap: Record<string, string> = {
    DEBUG: COLORS.gray,
    INFO: COLORS.blue,
    WARN: COLORS.yellow,
    ERROR: COLORS.red,
  };
  const color = colorMap[level] ?? COLORS.reset;
  const correlation = requestId ? ` ${COLORS.cyan}[${requestId}]${COLORS.reset}` : '';
  return `${color}[${level}]${COLORS.reset}${correlation} ${message}`;
}

function buildEntry(level: string, message: string, metadata: Record<string, unknown>, requestId?: string) {
  return {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(requestId && { requestId }),
    ...metadata,
  };
}

function extractMetadata(args: unknown[]): { message: string; metadata: Record<string, unknown> } {
  if (args.length === 0) return { message: '', metadata: {} };

  const message = String(args[0]);
  const metadata: Record<string, unknown> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg instanceof Error) {
      metadata.error = arg.message;
      if (isDev) {
        metadata.stack = arg.stack;
      }
    } else if (typeof arg === 'object' && arg !== null) {
      Object.assign(metadata, arg as Record<string, unknown>);
    } else {
      metadata[`arg${i}`] = arg;
    }
  }

  return { message, metadata };
}

function log(level: string, ...args: unknown[]) {
  const { message, metadata } = extractMetadata(args);
  const requestId = getCorrelationId();

  if (isDev) {
    const formatted = formatDev(level, message, requestId);
    const consoleMethod = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    if (Object.keys(metadata).length > 0) {
      consoleMethod(formatted, metadata);
    } else {
      consoleMethod(formatted);
    }
  } else {
    const entry = buildEntry(level, message, metadata, requestId);
    const consoleMethod = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    consoleMethod(JSON.stringify(entry));
  }
}

export interface StructuredLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  withCorrelationId(id: string): StructuredLogger;
}

function createLogger(_correlationId?: string): StructuredLogger {
  void _correlationId;
  return {
    debug: (...args: unknown[]) => log('DEBUG', ...args),
    info: (...args: unknown[]) => log('INFO', ...args),
    warn: (...args: unknown[]) => log('WARN', ...args),
    error: (...args: unknown[]) => log('ERROR', ...args),
    withCorrelationId(id: string) {
      return createLogger(id);
    },
  };
}

export const logger: StructuredLogger = createLogger();

/**
 * Set correlation ID for the current async context.
 * Returns a cleanup function to call when the request is done.
 * Only effective in production (uses AsyncLocalStorage).
 */
export function setCorrelationId(id: string): () => void {
  if (requestStorage) {
    requestStorage.enterWith({ requestId: id });
    return () => {}; // no-op cleanup — scope is managed by AsyncLocalStorage
  }
  return () => {};
}

/**
 * Run a function with a request ID in its async context.
 * Only effective in production (uses AsyncLocalStorage).
 */
export function runWithCorrelation<T>(id: string, fn: () => T): T {
  if (requestStorage) {
    return requestStorage.run({ requestId: id }, fn);
  }
  return fn();
}
