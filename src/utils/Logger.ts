/**
 * Simple structured logger with consistent formatting.
 * Provides module-prefixed logging at standard levels.
 */
export class Logger {
  constructor(private readonly module: string) {}

  debug(message: string, ...args: unknown[]): void {
    console.debug(`[${this.module}]`, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`[${this.module}]`, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${this.module}]`, message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[${this.module}]`, message, ...args);
  }
}
