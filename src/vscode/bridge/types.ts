import * as vscode from "vscode";
import type { ISessionHub } from "../../core/session/session-hub";
import type { IProcessPort, IStoragePort, IWorkspacePort } from "../../core/ports";
import type { ExtensionMessage } from "../../shared/ipc-protocol";
import type { AgentConfig } from "../../core/types/config";

export interface AcpViewProviderOptions {
  extensionUri: vscode.Uri;
  sessionHub: ISessionHub;
  processManager: IProcessPort;
  storageManager: IStoragePort;
  workspaceAdapter?: IWorkspacePort;
  outputChannel?: vscode.OutputChannel;
}

export interface BridgeContext {
  sessionHub: ISessionHub;
  processManager: IProcessPort;
  storageManager: IStoragePort;
  workspaceAdapter?: IWorkspacePort;
  outputChannel?: vscode.OutputChannel;
  postMessage: (msg: ExtensionMessage) => Promise<boolean>;
  broadcastStateSnapshot: () => Promise<void>;
  bindActiveSessionEvents: () => void;
  log: (msg: string) => void;
  getConfigRevisions?: () => Record<string, number>;
}

export function assertSupportedTransport(config?: AgentConfig): void {
  if (config?.transport === "websocket") {
    throw new Error(
      `WebSocket transport is not supported for agent "${config.name || config.id}". Only stdio is currently supported.`,
    );
  }
}

export function resolveConfigCwd(configCwd?: string): string {
  const workspaceFolders = vscode.workspace?.workspaceFolders;
  const root = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();
  if (configCwd && configCwd.trim().length > 0) {
    return configCwd.trim().replace(/\$\{workspaceFolder\}/g, root);
  }
  return root;
}

export function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
