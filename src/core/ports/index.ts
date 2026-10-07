/**
 * Ports: Hexagonal Architecture Abstract Boundaries
 */

import type { AgentConfig } from "../types/config";

export interface Disposable {
  dispose(): void | Promise<void>;
}

export type ProcessStatus =
  "stopped" | "starting" | "running" | "restarting" | "error";

export interface ProcessStatusEvent {
  agentId: string;
  status: ProcessStatus;
  pid?: number;
  error?: string;
}

export type ProcessLogCallback = (
  agentId: string,
  text: string,
  stream: "stdout" | "stderr" | "system",
) => void;

export interface IProcessPort {
  start(config: AgentConfig): Promise<{
    pid: number;
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
  }>;
  stop(agentId: string, force?: boolean): Promise<void>;
  restart(agentId: string): Promise<{ pid: number }>;
  getStatus(agentId: string): ProcessStatus;
  onStatusChange(listener: (event: ProcessStatusEvent) => void): Disposable;
  onLog?(listener: ProcessLogCallback): Disposable;
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
  /** Apply an editor edit only against the expected complete original text. */
  applyFileEdit?(
    path: string,
    originalContent: string,
    modifiedContent: string,
  ): Promise<boolean>;
  executeCommand(
    command: string,
    cwd?: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  listDirectory?(path: string): Promise<string[]>;
  fileExists?(path: string): Promise<boolean>;
  deleteFile?(path: string): Promise<void>;
}

export interface IStoragePort {
  recordInputHistory(prompt: string): Promise<void>;
  getInputHistory(): Promise<string[]>;
  saveAgentConfigs(configs: AgentConfig[]): Promise<void>;
  getAgentConfigs(): Promise<AgentConfig[]>;
}
