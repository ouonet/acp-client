/**
 * VS Code ACP Client Extension Host Entry Point
 */

import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import type { ISessionHub } from "../core/session/session-hub";
import type { AcpAdapterOptions } from "../core/protocol/acp-client-adapter";
import { StorageManager } from "../core/storage/storage-manager";
import { ProcessManager } from "../core/process/process-manager";
import { SessionHub } from "../core/session/session-hub";
import { AcpClientAdapter } from "../core/protocol/acp-client-adapter";
import { VsCodeWorkspaceAdapter } from "./ports/vscode-workspace-adapter";
import { AcpViewProvider } from "./acp-view-provider";
import { AcpChatParticipant } from "./chat-participant";
import type { AgentConfig } from "../core/types/config";

let processManager: ProcessManager | undefined;
let sessionHub: SessionHub | undefined;
let viewProvider: AcpViewProvider | undefined;
let chatParticipant: AcpChatParticipant | undefined;
const activeAdapters = new Map<string, AcpClientAdapter>();

export function createPermissionHandler(
  getHub: () => ISessionHub | undefined,
  agentId?: string,
  generation?: number,
): NonNullable<AcpAdapterOptions["onRequestPermission"]> {
  return async (params) => {
    const cancelled = { outcome: { outcome: "cancelled" as const } };
    const hub = getHub();
    if (generation !== undefined && (!agentId || hub?.getConnection(agentId)?.generation !== generation)) return cancelled;
    const targetSessionId = params?.sessionId || params?.session_id;
    let session =
      typeof targetSessionId === "string"
        ? hub?.getSession(targetSessionId, agentId)
        : undefined;
    if (!session && !targetSessionId && typeof hub?.getActiveSession === "function") {
      session = hub.getActiveSession();
    }
    if (!session || (agentId && session.agentId !== agentId)) return cancelled;
    try {
      const toolCall = params?.toolCall || params?.tool_call;
      const title =
        toolCall?.title ||
        toolCall?.name ||
        toolCall?.toolCallId ||
        toolCall?.id ||
        "Tool request";
      return await session.requestApproval(
        randomUUID(),
        title,
        params?.options || [],
      );
    } catch {
      return cancelled;
    }
  };
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("ACP Client");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine(
    `[${new Date().toISOString()}] [ACP Client] Extension activated.`,
  );

  const storageDir = context.globalStorageUri.fsPath;
  const storageManager = new StorageManager(storageDir);
  processManager = new ProcessManager();
  const workspaceAdapter = new VsCodeWorkspaceAdapter();

  processManager.onLog((agentId, text, stream) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${agentId}] [${stream.toUpperCase()}]`;
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.trim()) {
        outputChannel.appendLine(`${prefix} ${line}`);
      }
    }
  });

  sessionHub = new SessionHub({
    processManager,
    onDisconnect: async (agentId) => {
      const adapter = activeAdapters.get(agentId);
      activeAdapters.delete(agentId);
      await adapter?.close();
    },
    adapterFactory: async (agentId: string) => {
      const generation = sessionHub?.getConnection(agentId)?.generation;
      const current = () => sessionHub?.getConnection(agentId)?.generation === generation;
      const configs = await storageManager.getAgentConfigs();
      if (!current()) throw new Error("Agent connection closed before launch");
      const config = configs.find((c) => c.id === agentId);
      if (!config)
        throw new Error(`Agent configuration not found for id: ${agentId}`);
      if (config.transport !== "stdio")
        throw new Error("WebSocket transport is not supported");
      let adapter = activeAdapters.get(agentId);
      if (!adapter || !adapter.isConnected()) {
        await adapter?.close();
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const fallbackCwd = wsFolder || process.cwd();
        let resolvedCwd =
          config.cwd && config.cwd.trim() ? config.cwd.trim() : fallbackCwd;
        resolvedCwd = resolvedCwd
          .replace(/\$\{workspaceFolder\}/g, fallbackCwd)
          .replace(/\$\{workspaceRoot\}/g, fallbackCwd);
        const resolvedConfig = { ...config, cwd: resolvedCwd };
        outputChannel.appendLine(
          `[${new Date().toISOString()}] [ACP Client] Launching agent "${resolvedConfig.name}" (${resolvedConfig.command} ${(resolvedConfig.args || []).join(" ")}) in ${resolvedConfig.cwd}...`,
        );
        if (!current()) throw new Error("Agent connection closed before launch");
        const proc = await processManager!.start(resolvedConfig);
        if (!current()) {
          if (!sessionHub?.getConnection(agentId)) await processManager!.stop(agentId);
          throw new Error("Agent connection closed during launch");
        }
        adapter = new AcpClientAdapter({
          input: proc.stdout,
          output: proc.stdin,
          clientInfo: { name: "vscode-acp-client", version: "0.1.0" },
          onRequestPermission: createPermissionHandler(
            () => sessionHub,
            agentId,
            generation,
          ),
          onReadTextFile: (path) => workspaceAdapter.readFile(path),
          onWriteTextFile: (path, content) =>
            workspaceAdapter.writeFile(path, content),
        });
        activeAdapters.set(agentId, adapter);
        try {
          await adapter.initialize();
          if (!current() || activeAdapters.get(agentId) !== adapter) throw new Error("Agent connection closed during initialization");
        } catch (error) {
          if (activeAdapters.get(agentId) === adapter) activeAdapters.delete(agentId);
          await adapter.close();
          if (current() || !sessionHub?.getConnection(agentId)) await processManager!.stop(agentId);
          throw error;
        }
        outputChannel.appendLine(
          `[${new Date().toISOString()}] [ACP Client] Agent "${config.name}" connected and initialized successfully.`,
        );
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
    vscode.window.registerWebviewViewProvider(
      AcpViewProvider.viewType,
      viewProvider,
    ),
  );

  context.subscriptions.push(chatParticipant);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("acpClient.openChat", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.acpClientContainer",
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acpClient.showOutput", () => {
      outputChannel.show(true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acpClient.newSession", async () => {
      const configs = await storageManager.getAgentConfigs();
      const defaultAgent = sessionHub!.getActiveAgentId() ?? configs[0]?.id;
      if (!defaultAgent) throw new Error("Configure an Agent first");
      await sessionHub!.createSession(defaultAgent, "New Session");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("acpClient.forkSession", async () => {
      const active = sessionHub!.getActiveSession();
      if (active) {
        await sessionHub!.forkSession(active.id, { sourceAgentId: active.agentId });
      }
    }),
  );

  const existingConfigs = await storageManager.getAgentConfigs();
  const configuredBefore = context.globalState.get<boolean>("acpClient.agentDefaultsInitialized", false);

  // Initialize with aharness CLI (Zed-compliant ACP Agent) or migrate legacy default
  const defaultAharnessAgent: AgentConfig = {
    id: "aharness",
    name: "aharness",
    command: "uv",
    args: [
      "run",
      "--directory",
      "/Users/neo/workbench/test/ai/harness/aharness",
      "aharness",
      "acp",
      "serve",
    ],
    env: {},
    transport: "stdio",
    enabled: true,
  };

  if (!configuredBefore && existingConfigs.length === 0) {
    await storageManager.saveAgentConfigs([defaultAharnessAgent]);
  }
  if (!configuredBefore) await context.globalState.update("acpClient.agentDefaultsInitialized", true);
}

export async function deactivate(): Promise<void> {
  chatParticipant?.dispose();
  viewProvider?.dispose();
  await viewProvider?.waitForDisposal();
  const hub = sessionHub;
  sessionHub = undefined;
  await hub?.dispose();
  for (const adapter of activeAdapters.values()) await adapter.close();
  activeAdapters.clear();
  await processManager?.dispose();
}
