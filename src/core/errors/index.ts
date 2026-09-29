/**
 * Domain-specific Typed Errors
 */

export class ProcessError extends Error {
  readonly agentId: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;

  constructor(agentId: string, message: string, exitCode?: number | null, signal?: string | null) {
    super(`[ProcessError: ${agentId}] ${message}`);
    this.name = 'ProcessError';
    this.agentId = agentId;
    this.exitCode = exitCode;
    this.signal = signal;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProtocolError extends Error {
  readonly code: number;
  readonly data?: any;

  constructor(code: number, message: string, data?: any) {
    super(`[ProtocolError ${code}] ${message}`);
    this.name = 'ProtocolError';
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SessionError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string, message: string) {
    super(`[SessionError: ${sessionId}] ${message}`);
    this.name = 'SessionError';
    this.sessionId = sessionId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StorageError extends Error {
  readonly filePath?: string;

  constructor(message: string, filePath?: string) {
    super(`[StorageError] ${message}${filePath ? ` (file: ${filePath})` : ''}`);
    this.name = 'StorageError';
    this.filePath = filePath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
