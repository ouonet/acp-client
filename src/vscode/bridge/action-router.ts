import type { BridgeContext } from "./types";
import type { WebviewAction } from "../../shared/ipc-protocol";
import type { PromptHandler } from "./prompt-handler";
import type { SessionHandler } from "./session-handler";
import type { ConfigHandler } from "./config-handler";
import type { PermissionHandler } from "./permission-handler";
import type { WorkspaceHandler } from "./workspace-handler";

export class ActionRouter {
  constructor(private readonly ctx: BridgeContext, private readonly prompt: PromptHandler,
    private readonly sessions: SessionHandler, private readonly config: ConfigHandler,
    private readonly permission: PermissionHandler, private readonly workspace: WorkspaceHandler) {}

  public async handle(action: WebviewAction): Promise<void> {
    const payload = "payload" in action ? action.payload : undefined;
    try {
      if (payload && "agentId" in payload && payload.agentId && "generation" in payload && payload.generation !== undefined) {
        if (this.ctx.sessionHub.getConnection(payload.agentId)?.generation !== payload.generation) throw new Error("Agent connection changed; retry this operation");
      }
      const sessionId = payload && ("sessionId" in payload ? payload.sessionId : "sourceSessionId" in payload ? payload.sourceSessionId : undefined);
      if (payload && sessionId && "runtimeRevision" in payload && payload.runtimeRevision !== undefined) {
        const session = this.ctx.sessionHub.getSession(sessionId, "agentId" in payload ? payload.agentId : undefined);
        if (session?.serialize().runtimeRevision !== payload.runtimeRevision) throw new Error("Session runtime changed; retry this operation");
      }
      const forkedSessionId = await this.route(action);
      if (payload && "requestId" in payload && payload.requestId && action.type !== "SEND_PROMPT") {
        await this.ctx.postMessage({ type: "ACTION_RESULT", payload: { requestId: payload.requestId, action: action.type, agentId: "agentId" in payload ? payload.agentId : undefined, success: true, ...(action.type === "FORK_SESSION" && typeof forkedSessionId === "string" ? { sessionId: forkedSessionId } : {}) } });
      }
    } catch (error) {
      if (payload && "requestId" in payload && payload.requestId) {
        await this.ctx.postMessage({ type: "ACTION_RESULT", payload: { requestId: payload.requestId, action: action.type, agentId: "agentId" in payload ? payload.agentId : undefined, success: false, error: error instanceof Error ? error.message : String(error) } });
      }
      throw error;
    }
  }

  private async route(action: WebviewAction): Promise<string | void> {
    switch (action.type) {
      case "READY": case "REFRESH_SESSIONS": return this.ctx.broadcastStateSnapshot();
      case "SEND_PROMPT": return this.prompt.handleSendPrompt(action.payload);
      case "CANCEL_PROMPT": return this.prompt.handleCancelPrompt(action.payload.sessionId, action.payload.agentId);
      case "CREATE_SESSION": return this.sessions.handleCreateSession(action.payload);
      case "SWITCH_SESSION": return this.sessions.handleSwitchSession(action.payload.sessionId, action.payload.agentId);
      case "FORK_SESSION": return this.sessions.handleForkSession(action.payload.sourceSessionId, { ...action.payload.options, sourceAgentId: action.payload.agentId });
      case "REWIND_SESSION": return this.sessions.handleRewindSession(action.payload.sourceSessionId, action.payload.upToMessageIndex, action.payload.agentId);
      case "DELETE_SESSION": return this.sessions.handleDeleteSession(action.payload.sessionId, action.payload.agentId);
      case "REQUEST_AGENT_HISTORY": return this.sessions.handleHistoryRequest(action.payload);
      case "SELECT_AGENT": this.ctx.sessionHub.setActiveAgent(action.payload.agentId); break;
      case "DISCONNECT_AGENT": return this.config.handleStopAgent(action.payload.agentId);
      case "CLOSE_SESSION": await this.ctx.sessionHub.closeSession(action.payload.sessionId, action.payload.agentId); break;
      case "SAVE_AGENT_CONFIG": return this.config.handleSaveConfig(action.payload);
      case "DELETE_AGENT_CONFIG": return this.config.handleDeleteConfig(action.payload.agentId, action.payload);
      case "CONNECT_AGENT": return this.config.handleConnectAgent(action.payload.agentId);
      case "RESTART_AGENT_PROCESS": return this.config.handleRestartAgent(action.payload.agentId);
      case "STOP_AGENT_PROCESS": return this.config.handleStopAgent(action.payload.agentId);
      case "SET_CONFIG_OPTION": return this.config.handleSetConfigOption(action.payload);
      case "TEST_AGENT_CONNECTION": return this.config.handleTestConnection(action.payload);
      case "CANCEL_AGENT_TEST": return this.config.handleCancelAgentTest(action.payload);
      case "PICK_AGENT_DIRECTORY": return this.config.handlePickAgentDirectory(action.payload);
      case "RESPOND_PERMISSION": return this.permission.handleRespondPermission(action.payload);
      case "APPLY_FILE_DIFF": return this.workspace.handleApplyFileDiff(action.payload);
      case "OPEN_DIFF_EDITOR": return this.workspace.handleOpenDiffEditor(action.payload);
      case "SHOW_OUTPUT": this.ctx.outputChannel?.show(true); return;
      case "OPEN_FILE": return this.workspace.handleOpenFile(action.payload);
      case "INSERT_CODE_TO_EDITOR": return this.workspace.handleInsertCode(action.payload);
    }
    this.ctx.bindActiveSessionEvents();
    await this.ctx.broadcastStateSnapshot();
  }
}
