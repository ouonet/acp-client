/**
 * VS Code ACP Client Extension Host Entry Point
 */

import * as vscode from 'vscode';
import { StorageManager } from '../core/storage/storage-manager';
import { ProcessManager } from '../core/process/process-manager';
import { SessionHub } from '../core/session/session-hub';
import { AcpClientAdapter } from '../core/protocol/acp-client-adapter';
import { VsCodeWorkspaceAdapter } from './ports/vscode-workspace-adapter';
import { AcpViewProvider } from './acp-view-provider';
import { AcpChatParticipant } from './chat-participant';
import type { AgentConfig } from '../core/types/config';

let processManager: ProcessManager | undefined;
let sessionHub: SessionHub | undefined;
let viewProvider: AcpViewProvider | undefined;
let chatParticipant: AcpChatParticipant | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('ACP Client');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine(`[${new Date().toISOString()}] [ACP Client] Extension activated.`);

  const storageDir = context.globalStorageUri.fsPath;
  const storageManager = new StorageManager(storageDir);
  processManager = new ProcessManager();
  const workspaceAdapter = new VsCodeWorkspaceAdapter();

  processManager.onLog((agentId, text, stream) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${agentId}] [${stream.toUpperCase()}]`;
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        outputChannel.appendLine(`${prefix} ${line}`);
      }
    }
  });

  const activeAdapters = new Map<string, AcpClientAdapter>();

  sessionHub = new SessionHub({
    processManager,
    storageManager,
    adapterFactory: async (agentId: string) => {
      let adapter = activeAdapters.get(agentId);
      if (!adapter || !adapter.isConnected()) {
        const configs = await storageManager.getAgentConfigs();
        const config = configs.find((c) => c.id === agentId);
        if (!config) {
          throw new Error(`Agent configuration not found for id: ${agentId}`);
        }
        outputChannel.appendLine(
          `[${new Date().toISOString()}] [ACP Client] Launching agent "${config.name}" (${config.command} ${(config.args || []).join(' ')})...`
        );
        const proc = await processManager!.start(config);
        adapter = new AcpClientAdapter({
          input: proc.stdout,
          output: proc.stdin,
          clientInfo: { name: 'vscode-acp-client', version: '0.1.0' },
          onReadTextFile: (path) => workspaceAdapter.readFile(path),
          onWriteTextFile: (path, content) => workspaceAdapter.writeFile(path, content),
        });
        await adapter.initialize();
        outputChannel.appendLine(`[${new Date().toISOString()}] [ACP Client] Agent "${config.name}" connected and initialized successfully.`);
        activeAdapters.set(agentId, adapter);
      }
      return adapter;
    },
  });

  viewProvider = new AcpViewProvider({
    extensionUri: context.extensionUri,
    sessionHub,
    processManager,
    storageManager,
    workspaceAdapter,
    outputChannel,
  });

  chatParticipant = new AcpChatParticipant({
    sessionHub,
    storageManager,
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AcpViewProvider.viewType, viewProvider)
  );

  context.subscriptions.push(chatParticipant);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('acpClient.openChat', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.acpClientContainer');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acpClient.showOutput', () => {
      outputChannel.show(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acpClient.newSession', async () => {
      const configs = await storageManager.getAgentConfigs();
      const defaultAgent = configs[0]?.id || 'claude-code';
      await sessionHub!.createSession(defaultAgent, 'New Session');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('acpClient.forkSession', async () => {
      const active = sessionHub!.getActiveSession();
      if (active) {
        await sessionHub!.forkSession(active.id);
      }
    })
  );

  // Clean up any old Gemini config that was previously saved
  const existingConfigs = await storageManager.getAgentConfigs();
  const cleanedConfigs = existingConfigs.filter(
    (c) => c.id !== 'default-gemini' && !c.name.toLowerCase().includes('gemini')
  );
  if (cleanedConfigs.length !== existingConfigs.length) {
    await storageManager.saveAgentConfigs(cleanedConfigs);
    outputChannel.appendLine(`[${new Date().toISOString()}] [ACP Client] Removed deprecated Gemini configuration.`);
  }

  // Initialize with Claude Code CLI (Zed-compliant ACP Agent) if storage is empty
  if (cleanedConfigs.length === 0) {
    const sampleConfig: AgentConfig = {
      id: 'claude-code',
      name: 'Claude Code CLI',
      command: 'npx',
      args: ['@agentclientprotocol/claude-agent-acp'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };
    await storageManager.saveAgentConfigs([sampleConfig]);
    outputChannel.appendLine(`[${new Date().toISOString()}] [ACP Client] Initialized default Claude Code ACP agent configuration.`);
  }
}

export async function deactivate(): Promise<void> {
  chatParticipant?.dispose();
  viewProvider?.dispose();
  await sessionHub?.dispose();
  await processManager?.dispose();
}
