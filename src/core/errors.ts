/**
 * Base error class for all application errors.
 * Provides an optional error code for programmatic handling.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error thrown when a format decoder fails to parse or decode image/video data.
 * The error message includes the format name for easy identification.
 */
export class DecoderError extends AppError {
  constructor(format: string, detail: string) {
    super(`[${format}] ${detail}`, 'DECODER_ERROR');
    this.name = 'DecoderError';
  }
}

/**
 * Error thrown when the WebGL2 renderer encounters a failure
 * (e.g., shader compilation, texture upload, context loss).
 */
export class RenderError extends AppError {
  constructor(detail: string) {
    super(detail, 'RENDER_ERROR');
    this.name = 'RenderError';
  }
}

/**
 * Error thrown when a network operation fails
 * (e.g., fetching a remote image, connecting to a session server).
 */
export class NetworkError extends AppError {
  constructor(detail: string) {
    super(detail, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when a session-related operation fails
 * (e.g., session creation, state synchronization, authentication).
 */
export class SessionError extends AppError {
  constructor(detail: string) {
    super(detail, 'SESSION_ERROR');
    this.name = 'SessionError';
  }
}

/**
 * Error thrown when an API operation fails
 * (e.g., invalid state, unsupported operation, internal API failure).
 */
export class APIError extends AppError {
  constructor(detail: string) {
    super(detail, 'API_ERROR');
    this.name = 'APIError';
  }
}

/**
 * Error thrown when invalid arguments or state are passed to an API method
 * (e.g., wrong type, out of range, missing required field).
 */
export class ValidationError extends AppError {
  constructor(detail: string) {
    super(detail, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
