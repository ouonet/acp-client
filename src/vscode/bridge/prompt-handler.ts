import type { BridgeContext } from "./types";
import { assertSupportedTransport, resolveConfigCwd } from "./types";
import type { WebviewAction } from "../../shared/ipc-protocol";

export class PromptHandler {
  private readonly promptSubmissions = new Set<string>();

  constructor(private readonly ctx: BridgeContext) {}

  public async handleSendPrompt(
    payload: Extract<WebviewAction, { type: "SEND_PROMPT" }>["payload"],
  ): Promise<void> {
    const { sessionId, prompt, options, requestId, agentId } = payload;
    let resultSessionId = sessionId;
    let resultAgentId = agentId;
    let generation: number | undefined;
    let runtimeRevision: number | undefined;
    let accepted = false;

    const result = async (status: "accepted" | "completed" | "rejected", error?: string) => {
      if (requestId) {
        await this.ctx.postMessage({
          type: "PROMPT_RESULT",
          payload: { requestId, sessionId: resultSessionId, ...(resultAgentId ? { agentId: resultAgentId } : {}), ...(generation !== undefined ? { generation } : {}), ...(runtimeRevision !== undefined ? { runtimeRevision } : {}), status, ...(error ? { error } : {}) },
        });
      }
    };

    const submissionKey = JSON.stringify([agentId ?? this.ctx.sessionHub.getActiveAgentId?.(), sessionId || "new-session"]);
    if (this.promptSubmissions.has(submissionKey)) {
      await result("rejected", "A prompt submission is already in progress");
      return;
    }
    this.promptSubmissions.add(submissionKey);

    try {
      if (typeof sessionId !== "string" || (typeof prompt !== "string" && !Array.isArray(prompt))) {
        throw new Error("Invalid prompt payload");
      }
      let session = sessionId ? this.ctx.sessionHub.getSession(sessionId, agentId) : this.ctx.sessionHub.getActiveSession();
      if (sessionId && !session) throw new Error("Session not found");
      if (agentId && session?.agentId !== agentId) {
        if (sessionId) throw new Error("Session does not belong to the selected Agent");
        session = undefined;
      }
      if (!session) {
        const configs = await this.ctx.storageManager.getAgentConfigs();
        const config = agentId ? configs.find((c) => c.id === agentId) : configs[0];
        if (!config) {
          throw new Error(agentId ? "Selected Agent configuration not found" : "No ACP Agent configured.");
        }
        assertSupportedTransport(config);
        session = await this.ctx.sessionHub.createSession(config.id, undefined, {
          model: options?.model,
          thinkingLevel: options?.thinkingLevel,
          cwd: resolveConfigCwd(config.cwd),
        });
      }
      resultSessionId = session.id;
      resultAgentId = session.agentId;
      generation = this.ctx.sessionHub.getConnection?.(session.agentId)?.generation;
      runtimeRevision = session.serialize().runtimeRevision;
      if (session.serialize().attached === false) throw new Error("Session is detached; reload it before sending");
      // Match Session.prompt: attached sessions may retry a failed turn.
      if (session.status !== "idle" && session.status !== "error") {
        throw new Error(`Cannot send prompt while session is ${session.status}`);
      }

      const promptText = typeof prompt === "string" ? prompt : prompt.map((p) => (p.type === "text" ? p.text : "")).join(" ");
      if (promptText.trim()) {
        await this.ctx.storageManager.recordInputHistory?.(promptText.trim());
      }

      const latest = session.serialize();
      if (latest.attached === false || (session.status !== "idle" && session.status !== "error") || latest.runtimeRevision !== runtimeRevision || this.ctx.sessionHub.getConnection?.(session.agentId)?.generation !== generation) {
        throw new Error("Session changed while preparing the prompt; retry submission");
      }
      this.ctx.bindActiveSessionEvents();
      const turn = session.prompt(prompt, options);
      const settled = turn.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await result("accepted");
      accepted = true;
      void settled.then(async (outcome) => {
        if (outcome.ok) await result("completed");
        else {
          const error = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
          await result("rejected", error);
        }
      });
    } catch (err: any) {
      if (!accepted) {
        const error = err?.message || String(err);
        await result("rejected", error);
      }
      throw err;
    } finally {
      this.promptSubmissions.delete(submissionKey);
    }
  }

  public async handleCancelPrompt(sessionId?: string, agentId?: string): Promise<void> {
    const session = sessionId ? this.ctx.sessionHub.getSession(sessionId, agentId) : this.ctx.sessionHub.getActiveSession();
    if (session) {
      await session.cancel();
      await this.ctx.broadcastStateSnapshot();
    }
  }
}
