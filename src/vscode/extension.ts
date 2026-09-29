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
  const storageDir = context.globalStorageUri.fsPath;
  const storageManager = new StorageManager(storageDir);
  processManager = new ProcessManager();
  const workspaceAdapter = new VsCodeWorkspaceAdapter();

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
        const proc = await processManager!.start(config);
        adapter = new AcpClientAdapter({
          input: proc.stdout,
          output: proc.stdin,
          clientInfo: { name: 'vscode-acp-client', version: '0.1.0' },
          onReadTextFile: (path) => workspaceAdapter.readFile(path),
          onWriteTextFile: (path, content) => workspaceAdapter.writeFile(path, content),
        });
        await adapter.initialize();
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
    vscode.commands.registerCommand('acpClient.newSession', async () => {
      const configs = await storageManager.getAgentConfigs();
      const defaultAgent = configs[0]?.id || 'default-agent';
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

  // Initialize with a default agent config if storage is empty
  const existingConfigs = await storageManager.getAgentConfigs();
  if (existingConfigs.length === 0) {
    const sampleConfig: AgentConfig = {
      id: 'default-gemini',
      name: 'Gemini CLI Agent',
      command: 'npx',
      args: ['@google/gemini-cli', 'acp'],
      env: {},
      transport: 'stdio',
      enabled: true,
    };
    await storageManager.saveAgentConfigs([sampleConfig]);
  }
}

export async function deactivate(): Promise<void> {
  chatParticipant?.dispose();
  viewProvider?.dispose();
  await sessionHub?.dispose();
  await processManager?.dispose();
}
