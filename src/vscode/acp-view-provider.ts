/**
 * VS Code Webview View Provider & Unidirectional IPC Bridge
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ISessionHub } from '../core/session/session-hub';
import type { IProcessPort, IStoragePort, IWorkspacePort, Disposable } from '../core/ports';
import { AcpClientAdapter } from '../core/protocol/acp-client-adapter';
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
  outputChannel?: vscode.OutputChannel;
}

export class AcpViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'acpClient.chatView';

  private view?: vscode.WebviewView;
  private readonly extensionUri: vscode.Uri;
  private readonly sessionHub: ISessionHub;
  private readonly processManager: IProcessPort;
  private readonly storageManager: IStoragePort;
  private readonly workspaceAdapter?: IWorkspacePort;
  private readonly outputChannel?: vscode.OutputChannel;

  private readonly disposables: Disposable[] = [];

  constructor(options: AcpViewProviderOptions) {
    this.extensionUri = options.extensionUri;
    this.sessionHub = options.sessionHub;
    this.processManager = options.processManager;
    this.storageManager = options.storageManager;
    this.workspaceAdapter = options.workspaceAdapter;
    this.outputChannel = options.outputChannel;

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
        try {
          await this.handleAction(data);
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          this.log(`Error handling action ${data.type}: ${errMsg}`);
          vscode.window
            .showErrorMessage(`ACP Client: ${errMsg}`, 'Show Output')
            .then((choice) => {
              if (choice === 'Show Output') {
                this.outputChannel?.show(true);
              }
            });
        }
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  public log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel?.appendLine(`[${timestamp}] [AcpViewProvider] ${message}`);
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
        try {
          const configs = await this.storageManager.getAgentConfigs();
          const targetId = configs.some((c) => c.id === agentId)
            ? agentId
            : configs[0]?.id;
          if (!targetId) {
            vscode.window.showWarningMessage('No ACP Agent configured. Please configure an agent first.');
            break;
          }
          this.log(`Creating session for agent "${targetId}"`);
          await this.sessionHub.createSession(targetId, title, { model, thinkingLevel, cwd });
          this.log(`Session created successfully for agent "${targetId}"`);
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          this.log(`Failed to create session for agent ${agentId}: ${errMsg}`);
          vscode.window
            .showErrorMessage(`Failed to connect to agent "${agentId}": ${errMsg}`, 'Show Output')
            .then((choice) => {
              if (choice === 'Show Output') {
                this.outputChannel?.show(true);
              }
            });
        }
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

      case 'SHOW_OUTPUT': {
        this.outputChannel?.show(true);
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

      case 'APPLY_FILE_DIFF': {
        if (this.workspaceAdapter) {
          const { filePath, content } = action.payload;
          await this.workspaceAdapter.writeFile(filePath, content);
          vscode.window.showInformationMessage(`ACP: Applied changes to ${path.basename(filePath)}`);
        }
        break;
      }

      case 'OPEN_DIFF_EDITOR': {
        const { filePath, originalContent, modifiedContent } = action.payload;
        await this.openDiffEditor(filePath, originalContent, modifiedContent);
        break;
      }

      default:
        break;
    }
  }

  private async openDiffEditor(
    filePath: string,
    originalContent: string,
    modifiedContent: string
  ): Promise<void> {
    const tmpDir = path.join(os.tmpdir(), 'acp-diff');
    await fs.mkdir(tmpDir, { recursive: true });
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const origPath = path.join(tmpDir, `${base}.original${ext}`);
    const modPath = path.join(tmpDir, `${base}.modified${ext}`);

    await fs.writeFile(origPath, originalContent, 'utf-8');
    await fs.writeFile(modPath, modifiedContent, 'utf-8');

    const origUri = vscode.Uri.file(origPath);
    const modUri = vscode.Uri.file(modPath);

    await vscode.commands.executeCommand(
      'vscode.diff',
      origUri,
      modUri,
      `${path.basename(filePath)} (ACP Diff Review)`
    );
  }

  private async testAgentConnection(config: AgentConfig): Promise<void> {
    const startTime = Date.now();
    this.log(`[Test Connection] Starting probe for agent: "${config.name}" (${config.command} ${(config.args || []).join(' ')})`);

    // Prepare augmented PATH for macOS/Linux GUI environments
    const isWindows = process.platform === 'win32';
    const env = { ...process.env, ...config.env };
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const extraPaths = [
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        process.env.HOME ? `${process.env.HOME}/.nvm/current/bin` : '',
        process.env.HOME ? `${process.env.HOME}/.cargo/bin` : '',
        process.env.HOME ? `${process.env.HOME}/.local/bin` : '',
      ].filter(Boolean);
      const currentPaths = (env.PATH || '').split(':');
      for (const p of extraPaths) {
        if (!currentPaths.includes(p)) {
          currentPaths.unshift(p);
        }
      }
      env.PATH = currentPaths.join(':');
    }

    let child: ChildProcess | null = null;
    let stderrBuffer = '';
    const cwd = config.cwd || (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd());

    try {
      if (!config.command || !config.command.trim()) {
        throw new Error('Command is empty. Please enter an executable command (e.g. npx).');
      }

      child = spawn(config.command, config.args || [], {
        env,
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWindows,
      });

      this.log(`[Test Connection] Spawned probe process (PID: ${child.pid})`);

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer = (stderrBuffer + text).slice(-4096);
        this.log(`[Test Connection STDERR] ${text.trim()}`);
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        this.log(`[Test Connection STDOUT] ${chunk.toString().trim()}`);
      });

      // Wrap ACP handshake with probe logic
      const probePromise = new Promise<{ protocolVersion?: number; capabilities?: any }>((resolve, reject) => {
        if (!child || !child.stdout || !child.stdin) {
          return reject(new Error('Failed to open stdio streams to process'));
        }

        const adapter = new AcpClientAdapter({
          input: child.stdout,
          output: child.stdin,
          clientInfo: { name: 'vscode-acp-client-test', version: '0.1.0' },
        });

        child.on('error', (err: Error) => {
          reject(new Error(`Failed to spawn "${config.command}": ${err.message}`));
        });

        child.on('exit', (code: number | null) => {
          if (code !== 0 && code !== null) {
            const errDetail = stderrBuffer.trim() ? `: ${stderrBuffer.trim()}` : '';
            reject(new Error(`Process exited prematurely with code ${code}${errDetail}`));
          }
        });

        adapter
          .initialize()
          .then((initResult) => {
            resolve({
              protocolVersion: initResult.protocolVersion,
              capabilities: initResult.agentCapabilities,
            });
          })
          .catch((err) => {
            reject(err);
          });
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const errDetail = stderrBuffer.trim() ? ` (stderr: ${stderrBuffer.trim()})` : '';
          reject(new Error(`Connection test timed out after 8s${errDetail}`));
        }, 8000);
      });

      const result = await Promise.race([probePromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;
      this.log(`[Test Connection] Handshake successful in ${durationMs}ms (Protocol v${result.protocolVersion || 1})`);

      await this.postMessage({
        type: 'TEST_CONNECTION_RESULT',
        payload: {
          success: true,
          protocolVersion: result.protocolVersion,
          capabilities: result.capabilities,
          durationMs,
        },
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      let errMsg = err?.message || 'Connection test failed';
      if (stderrBuffer.trim() && !errMsg.includes(stderrBuffer.trim())) {
        errMsg += `\n${stderrBuffer.trim()}`;
      }
      this.log(`[Test Connection] Failed in ${durationMs}ms: ${errMsg}`);

      await this.postMessage({
        type: 'TEST_CONNECTION_RESULT',
        payload: {
          success: false,
          error: errMsg,
          durationMs,
        },
      });
    } finally {
      if (child && !child.killed) {
        try {
          child.kill('SIGTERM');
          setTimeout(() => {
            try {
              if (child && !child.killed) {
                child.kill('SIGKILL');
              }
            } catch {
              // ignore
            }
          }, 1000);
        } catch {
          // ignore
        }
      }
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
