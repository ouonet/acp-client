import { window } from "vscode";
import type { BridgeContext } from "./types";
import { AgentConfigStore } from "./agent-config-store";
import { ConnectionTestRegistry } from "./connection-test-registry";
import { type ConfigMetadata, type ConfigPayload, errorMessage, unpackConfig, validateConfig } from "./agent-config-validation";

export class ConfigHandler {
  private readonly tests: ConnectionTestRegistry;
  private readonly store: AgentConfigStore;
  private readonly connectFences = new Map<string, number>();
  private disposed = false;
  constructor(private readonly ctx: BridgeContext) {
    this.tests = new ConnectionTestRegistry(ctx);
    this.store = new AgentConfigStore(ctx, id => this.tests.cancelConfig(id));
  }
  public getConfigRevisions(): Record<string, number> { return this.store.getRevisions(); }
  public dispose(): void { this.disposed = true; this.tests.dispose(); }
  public cancelTests(): void { this.tests.cancelAll(); }
  public waitForTests(): Promise<void> { return this.tests.waitForTests(); }
  public async handleSaveConfig(payload: ConfigPayload): Promise<void> {
    const { config, metadata } = unpackConfig(payload);
    await this.store.save(config, metadata);
  }
  public async handleDeleteConfig(agentId: string, metadata: ConfigMetadata = {}): Promise<void> {
    await this.store.delete(agentId, metadata);
  }
  public async handleConnectAgent(agentId: string): Promise<void> {
    if (this.disposed) throw new Error("Configuration handler is disposed");
    const fence = this.connectFences.get(agentId) ?? 0;
    const release = this.store.reserve(agentId);
    try {
      await this.store.enqueue(async () => {
        const config = (await this.ctx.storageManager.getAgentConfigs()).find(item => item.id === agentId);
        if (!config) throw new Error("Agent configuration not found");
        validateConfig(config);
        if (config.enabled === false && !this.ctx.sessionHub.getConnection(agentId)) throw new Error("Agent is disabled");
      });
      if (this.disposed || fence !== (this.connectFences.get(agentId) ?? 0)) throw new Error("Agent connection cancelled");
      await this.ctx.sessionHub.connectAgent(agentId);
      this.ctx.sessionHub.setActiveAgent(agentId);
      await this.ctx.broadcastStateSnapshot();
    } finally { release(); }
  }
  public async handleRestartAgent(agentId: string): Promise<void> {
    await this.handleStopAgent(agentId);
    await this.handleConnectAgent(agentId);
  }
  public async handleStopAgent(agentId: string): Promise<void> {
    this.connectFences.set(agentId, (this.connectFences.get(agentId) ?? 0) + 1);
    await this.ctx.sessionHub.disconnectAgent(agentId);
    await this.ctx.broadcastStateSnapshot();
  }
  public async handleSetConfigOption(payload: { sessionId?: string; agentId?: string; configId: string; value: string }): Promise<void> {
    const session = payload.sessionId ? this.ctx.sessionHub.getSession(payload.sessionId, payload.agentId) : this.ctx.sessionHub.getActiveSession();
    if (!session || session.attached === false) throw new Error("Session is unavailable");
    const current = session.serialize();
    if (![current.modelConfigId, current.thinkingConfigId].includes(payload.configId)) throw new Error("Config option is not advertised");
    try {
      await session.setConfigOption(payload.configId, payload.value);
    } finally {
      await this.ctx.broadcastStateSnapshot();
    }
  }
  public async handleTestConnection(payload: ConfigPayload): Promise<void> { await this.tests.run(payload); }
  public async handleCancelAgentTest(payload: { configId: string; requestId: string; testRequestId: string }): Promise<void> { await this.tests.cancel(payload); }
  public async handlePickAgentDirectory(payload: { configId: string; requestId: string; draftRevision: number; cwdRevision: number }): Promise<void> {
    try {
      const selected = await window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: "Select Agent working directory" });
      await this.ctx.postMessage({ type: "AGENT_CONFIG_RESULT", payload: {
        ...payload, operation: "directory", success: true, ...(selected?.[0] ? { cwd: selected[0].fsPath } : {}),
      } });
    } catch (error) {
      await this.ctx.postMessage({ type: "AGENT_CONFIG_RESULT", payload: { ...payload, operation: "directory", success: false, error: errorMessage(error) } });
    }
  }
}
