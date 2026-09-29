/**
 * Ports: Hexagonal Architecture Abstract Boundaries
 */

import type { AgentConfig } from '../types/config';
import type { SessionData, SessionSummary } from '../types/session';

export interface Disposable {
  dispose(): void | Promise<void>;
}

export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'restarting' | 'error';

export interface ProcessStatusEvent {
  agentId: string;
  status: ProcessStatus;
  pid?: number;
  error?: string;
}

export interface IProcessPort {
  start(config: AgentConfig): Promise<{ pid: number; stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream }>;
  stop(agentId: string, force?: boolean): Promise<void>;
  restart(agentId: string): Promise<{ pid: number }>;
  getStatus(agentId: string): ProcessStatus;
  onStatusChange(listener: (event: ProcessStatusEvent) => void): Disposable;
  dispose(): Promise<void>;
}

export interface ITransportPort {
  send(message: any): Promise<void>;
  onMessage(handler: (message: any) => void): Disposable;
  close(): Promise<void>;
}

export interface IWorkspacePort {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  executeCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface IStoragePort {
  saveSession(sessionData: SessionData): Promise<void>;
  loadSession(sessionId: string): Promise<SessionData | null>;
  listSavedSessions(): Promise<SessionSummary[]>;
  deleteSavedSession(sessionId: string): Promise<void>;
  recordInputHistory(prompt: string): Promise<void>;
  getInputHistory(): Promise<string[]>;
  saveAgentConfigs(configs: AgentConfig[]): Promise<void>;
  getAgentConfigs(): Promise<AgentConfig[]>;
}
