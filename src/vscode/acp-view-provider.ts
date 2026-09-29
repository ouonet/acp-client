/**
 * VS Code Webview View Provider & Unidirectional IPC Bridge
 */

import * as vscode from 'vscode';
import type { ISessionHub } from '../core/session/session-hub';
import type { IProcessPort, IStoragePort, IWorkspacePort, Disposable } from '../core/ports';
import {
  isWebviewAction,
  type WebviewAction,
  type ExtensionMessage,
  type WebviewStateSnapshot,
} from '../shared/ipc-protocol';
import type { AgentConfig } from '../core/types/config';

export interface AcpViewProviderOptions {
  extensionUri: vscode.Uri;
  sessionHub: ISessionHub;
  processManager: IProcessPort;
  storageManager: IStoragePort;
  workspaceAdapter?: IWorkspacePort;
}

export class AcpViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'acpClient.chatView';

  private view?: vscode.WebviewView;
  private readonly extensionUri: vscode.Uri;
  private readonly sessionHub: ISessionHub;
  private readonly processManager: IProcessPort;
  private readonly storageManager: IStoragePort;
  private readonly workspaceAdapter?: IWorkspacePort;

  private readonly disposables: Disposable[] = [];

  constructor(options: AcpViewProviderOptions) {
    this.extensionUri = options.extensionUri;
    this.sessionHub = options.sessionHub;
    this.processManager = options.processManager;
    this.storageManager = options.storageManager;
    this.workspaceAdapter = options.workspaceAdapter;

    // Subscribe to session list changes
    this.disposables.push(
      this.sessionHub.onSessionListChange(() => {
        this.broadcastStateSnapshot();
      })
    );

    // Subscribe to active session changes
    this.disposables.push(
      this.sessionHub.onActiveSessionChange(() => {
        this.broadcastStateSnapshot();
      })
    );

    // Subscribe to process status changes
    this.disposables.push(
      this.processManager.onStatusChange((event) => {
        this.postMessage({
          type: 'PROCESS_STATUS_CHANGE',
          payload: event,
        });
      })
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data: unknown) => {
      if (isWebviewAction(data)) {
        await this.handleAction(data);
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  public async postMessage(message: ExtensionMessage): Promise<boolean> {
    if (this.view) {
      return this.view.webview.postMessage(message);
    }
    return false;
  }

  public async broadcastStateSnapshot(): Promise<void> {
    if (!this.view) return;

    const activeSession = this.sessionHub.getActiveSession();
    const sessions = this.sessionHub.listSessions();
    const agentConfigs = await this.storageManager.getAgentConfigs();
    const inputHistory = await this.storageManager.getInputHistory();

    const processStatuses: Record<string, any> = {};
    for (const config of agentConfigs) {
      processStatuses[config.id] = this.processManager.getStatus(config.id);
    }

    const snapshot: WebviewStateSnapshot = {
      activeSession: activeSession ? activeSession.serialize() : undefined,
      sessions,
      agentConfigs,
      inputHistory,
      processStatuses,
    };

    await this.postMessage({
      type: 'STATE_SNAPSHOT',
      payload: snapshot,
    });
  }

  public dispose(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
    this.disposables.length = 0;
  }

  private async handleAction(action: WebviewAction): Promise<void> {
    switch (action.type) {
      case 'READY': {
        await this.broadcastStateSnapshot();
        break;
      }

      case 'SEND_PROMPT': {
        const { sessionId, prompt, options } = action.payload;
        let session = this.sessionHub.getSession(sessionId);

        if (!session) {
          const configs = await this.storageManager.getAgentConfigs();
          const defaultAgentId = configs[0]?.id || 'default-agent';
          session = await this.sessionHub.createSession(defaultAgentId);
        }

        if (typeof prompt === 'string' && prompt.trim()) {
          await this.storageManager.recordInputHistory(prompt);
          const history = await this.storageManager.getInputHistory();
          await this.postMessage({
            type: 'INPUT_HISTORY_UPDATE',
            payload: { history },
          });
        }

        session.prompt(prompt, options).catch((err) => {
          console.error('[AcpViewProvider] prompt error:', err);
        });
        break;
      }

      case 'CANCEL_PROMPT': {
        const session = this.sessionHub.getSession(action.payload.sessionId);
        if (session) {
          await session.cancel();
        }
        break;
      }

      case 'RESPOND_PERMISSION': {
        const { sessionId, requestId, decision, options } = action.payload;
        const session = this.sessionHub.getSession(sessionId);
        if (session) {
          await session.respondPermission(requestId, decision, options);
        }
        break;
      }

      case 'CREATE_SESSION': {
        const { agentId, title, model, thinkingLevel, cwd } = action.payload;
        await this.sessionHub.createSession(agentId, title, { model, thinkingLevel, cwd });
        await this.broadcastStateSnapshot();
        break;
      }

      case 'SWITCH_SESSION': {
        this.sessionHub.setActiveSession(action.payload.sessionId);
        await this.broadcastStateSnapshot();
        break;
      }

      case 'FORK_SESSION': {
        const { sourceSessionId, options } = action.payload;
        await this.sessionHub.forkSession(sourceSessionId, options);
        await this.broadcastStateSnapshot();
        break;
      }

      case 'DELETE_SESSION': {
        await this.sessionHub.deleteSession(action.payload.sessionId);
        await this.broadcastStateSnapshot();
        break;
      }

      case 'SAVE_AGENT_CONFIG': {
        const { config } = action.payload;
        const existing = await this.storageManager.getAgentConfigs();
        const index = existing.findIndex((c) => c.id === config.id);
        if (index >= 0) {
          existing[index] = config;
        } else {
          existing.push(config);
        }
        await this.storageManager.saveAgentConfigs(existing);
        await this.broadcastStateSnapshot();
        break;
      }

      case 'DELETE_AGENT_CONFIG': {
        const { agentId } = action.payload;
        const existing = await this.storageManager.getAgentConfigs();
        const filtered = existing.filter((c) => c.id !== agentId);
        await this.storageManager.saveAgentConfigs(filtered);
        await this.broadcastStateSnapshot();
        break;
      }

      case 'TEST_AGENT_CONNECTION': {
        await this.testAgentConnection(action.payload.config);
        break;
      }

      case 'RESTART_AGENT_PROCESS': {
        await this.processManager.restart(action.payload.agentId);
        break;
      }

      case 'STOP_AGENT_PROCESS': {
        await this.processManager.stop(action.payload.agentId);
        break;
      }

      case 'INSERT_CODE_TO_EDITOR': {
        this.insertCodeToEditor(action.payload.code);
        break;
      }

      default:
        break;
    }
  }

  private async testAgentConnection(config: AgentConfig): Promise<void> {
    const startTime = Date.now();
    try {
      const proc = await this.processManager.start(config);
      const durationMs = Date.now() - startTime;
      await this.postMessage({
        type: 'TEST_CONNECTION_RESULT',
        payload: {
          success: true,
          protocolVersion: 1,
          capabilities: { pid: proc.pid },
          durationMs,
        },
      });
    } catch (err: any) {
      await this.postMessage({
        type: 'TEST_CONNECTION_RESULT',
        payload: {
          success: false,
          error: err.message || 'Connection test failed',
          durationMs: Date.now() - startTime,
        },
      });
    }
  }

  private insertCodeToEditor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, code);
      });
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'))
      : 'dist/webview.js';

    const styleUri = webview.asWebviewUri
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'))
      : 'dist/webview.css';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>ACP Client Cockpit</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
