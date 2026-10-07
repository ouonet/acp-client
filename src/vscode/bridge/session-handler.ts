import * as vscode from "vscode";
import type { BridgeContext } from "./types";
import { assertSupportedTransport, resolveConfigCwd } from "./types";

export class SessionHandler {
  constructor(private readonly ctx: BridgeContext) {}

  public async handleCreateSession(payload: any): Promise<void> {
    const { agentId, title, model, thinkingLevel, cwd } = payload;
    const configs = await this.ctx.storageManager.getAgentConfigs();
    if (agentId && !configs.some((c) => c.id === agentId)) {
      throw new Error("Selected Agent configuration not found");
    }
    const targetId = agentId || this.ctx.sessionHub.getActiveAgentId?.() || configs[0]?.id;
    if (!targetId) {
      vscode.window.showWarningMessage("No ACP Agent configured. Please configure an agent first.");
      return;
    }
    const targetConfig = configs.find((c) => c.id === targetId);
    assertSupportedTransport(targetConfig);
    const effectiveCwd = resolveConfigCwd(cwd || targetConfig?.cwd);
    this.ctx.log(`Creating session for agent "${targetId}" in ${effectiveCwd}`);
    await this.ctx.sessionHub.createSession(targetId, title, { model, thinkingLevel, cwd: effectiveCwd });
    this.ctx.bindActiveSessionEvents();
    this.ctx.log(`Session created successfully for agent "${targetId}"`);
    await this.ctx.broadcastStateSnapshot();
  }

  public async handleSwitchSession(sessionId: string, agentId?: string): Promise<void> {
    const targetAgentId = agentId ?? this.ctx.sessionHub.getActiveAgentId?.() ?? this.ctx.sessionHub.getActiveSession()?.agentId;
    const targetConfig = (await this.ctx.storageManager.getAgentConfigs()).find((c) => c.id === targetAgentId);
    const effectiveCwd = resolveConfigCwd(targetConfig?.cwd);

    if (this.ctx.sessionHub.restoreSession) {
      await this.ctx.sessionHub.restoreSession(sessionId, targetAgentId, effectiveCwd);
    } else {
      this.ctx.sessionHub.setActiveSession(sessionId);
    }
    this.ctx.bindActiveSessionEvents();
    await this.ctx.broadcastStateSnapshot();
  }

  public async handleHistoryRequest(payload: { agentId: string; requestId: string; cursor?: string }): Promise<void> {
    const generation = this.ctx.sessionHub.getConnection(payload.agentId)?.generation;
    try {
      const config = (await this.ctx.storageManager.getAgentConfigs()).find((c) => c.id === payload.agentId);
      const page = await this.ctx.sessionHub.listAgentSessionPage(payload.agentId, { cursor: payload.cursor, cwd: resolveConfigCwd(config?.cwd) });
      await this.ctx.postMessage({ type: "AGENT_HISTORY_RESULT", payload: { ...payload, generation, ...page } });
    } catch (error) {
      await this.ctx.postMessage({ type: "AGENT_HISTORY_RESULT", payload: { ...payload, generation, sessions: [], error: error instanceof Error ? error.message : String(error) } });
    }
  }

  public async handleForkSession(sourceSessionId: string, options?: any): Promise<string> {
    const targetAgentId = options?.newAgentId;
    if (targetAgentId) {
      const targetConfig = (await this.ctx.storageManager.getAgentConfigs()).find((c) => c.id === targetAgentId);
      assertSupportedTransport(targetConfig);
    }
    const session = await this.ctx.sessionHub.forkSession(sourceSessionId, options);
    this.ctx.bindActiveSessionEvents();
    await this.ctx.broadcastStateSnapshot();
    return session.id;
  }

  public async handleRewindSession(sessionId: string, upToMessageIndex: number, agentId?: string): Promise<void> {
    await this.ctx.sessionHub.rewindSession(sessionId, upToMessageIndex, agentId);
    this.ctx.bindActiveSessionEvents();
    await this.ctx.broadcastStateSnapshot();
  }

  public async handleDeleteSession(sessionId: string, agentId?: string): Promise<void> {
    try {
      await this.ctx.sessionHub.deleteSession(sessionId, agentId);
    } catch (err: any) {
      this.ctx.log(`Failed to delete session: ${err?.message || err}`);
      await this.ctx.broadcastStateSnapshot();
      throw err;
    }
    this.ctx.bindActiveSessionEvents();
    await this.ctx.broadcastStateSnapshot();
  }
}
