/**
 * Simple structured logger with consistent formatting.
 * Supports log levels, filtering, custom sinks, and module-prefixed output.
 */

export const LogLevel = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export type LogSink = (level: LogLevel, ...args: unknown[]) => void;

const defaultSink: LogSink = (level, ...args) => {
  const fn =
    level === LogLevel.DEBUG
      ? console.debug
      : level === LogLevel.INFO
        ? console.info
        : level === LogLevel.WARN
          ? console.warn
          : console.error;
  fn(...args);
};

// In Vite, import.meta.env.DEV is true during development and testing
const isDev = import.meta.env?.DEV === true;

let currentLevel: LogLevel = isDev ? LogLevel.DEBUG : LogLevel.WARN;
let currentSink: LogSink = defaultSink;

export class Logger {
  constructor(private readonly module: string) {}

  /** Set the minimum log level globally. Messages below this level are suppressed. */
  static setLevel(level: LogLevel): void {
    currentLevel = level;
  }

  /** Replace the default console output with a custom sink. */
  static setSink(sink: LogSink | null): void {
    currentSink = sink ?? defaultSink;
  }

  /** Convenience factory — equivalent to `new Logger(context)`. */
  static withContext(context: string): Logger {
    return new Logger(context);
  }

  debug(message: string, ...args: unknown[]): void {
    if (currentLevel > LogLevel.DEBUG) return;
    currentSink(LogLevel.DEBUG, `[${this.module}]`, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (currentLevel > LogLevel.INFO) return;
    currentSink(LogLevel.INFO, `[${this.module}]`, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (currentLevel > LogLevel.WARN) return;
    currentSink(LogLevel.WARN, `[${this.module}]`, message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    currentSink(LogLevel.ERROR, `[${this.module}]`, message, ...args);
  }
}
