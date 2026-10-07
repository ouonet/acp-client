import type { BridgeContext } from "./types";

export class PermissionHandler {
  constructor(private readonly ctx: BridgeContext) {}

  public async handleRespondPermission(payload: {
    sessionId?: string;
    agentId?: string;
    requestId: string;
    decision: "allow" | "deny" | "always_allow_session";
    optionId?: string;
    options?: any;
  }): Promise<void> {
    const { sessionId, requestId, decision, optionId, options } = payload;
    const session = sessionId
      ? this.ctx.sessionHub.getSession(sessionId, payload.agentId)
      : this.ctx.sessionHub.getActiveSession();
    if (session) {
      await session.respondPermission(
        requestId,
        decision,
        optionId ? { optionId } : options,
      );
      await this.ctx.broadcastStateSnapshot();
    }
  }
}
