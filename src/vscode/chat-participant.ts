/**
 * VS Code Native Chat Participant (@acp) Bridge
 */

import * as vscode from "vscode";
import type { ISessionHub } from "../core/session/session-hub";
import type { IStoragePort } from "../core/ports";

export interface ChatParticipantOptions {
  sessionHub: ISessionHub;
  storageManager?: IStoragePort;
}

export class AcpChatParticipant implements vscode.Disposable {
  public static readonly participantId = "acpClient.acpParticipant";
  private participant: vscode.ChatParticipant;

  constructor(private options: ChatParticipantOptions) {
    this.participant = vscode.chat.createChatParticipant(
      AcpChatParticipant.participantId,
      this.handleRequest.bind(this),
    );
  }

  public async handleRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult | void> {
    const { sessionHub, storageManager } = this.options;

    // Handle slash sub-commands: /clear or /fork
    if (request.command === "clear") {
      const configs = (await storageManager?.getAgentConfigs()) || [];
      const defaultAgent = configs[0]?.id || "default-agent";
      await sessionHub.createSession(defaultAgent, "Chat Session");
      stream.markdown("Cleared active session and created a new ACP session.");
      return;
    }

    if (request.command === "fork") {
      const active = sessionHub.getActiveSession();
      if (!active) {
        stream.markdown(
          "No active session to fork. Please send a message first.",
        );
        return;
      }
      const forked = await sessionHub.forkSession(active.id);
      stream.markdown(
        `Forked session \`${active.id.slice(0, 8)}\` into new session \`${forked.id.slice(0, 8)}\`.`,
      );
      return;
    }

    // Normal message flow: resolve active session or create new one
    let session = sessionHub.getActiveSession();
    if (!session) {
      const configs = (await storageManager?.getAgentConfigs()) || [];
      const defaultAgent = configs[0]?.id || "default-agent";
      session = await sessionHub.createSession(defaultAgent, "Chat Session");
    }

    // Subscribe to session streaming updates
    const subscription = session.onEvent((event) => {
      if (event.type === "chunk") {
        const text = event.payload?.content?.text || "";
        if (text) {
          stream.markdown(text);
        }
      } else if (event.type === "tool_call") {
        stream.progress(`Executing tool: ${event.payload?.title || "tool"}...`);
      }
    });

    // Cancellation hook
    token.onCancellationRequested(async () => {
      await session.cancel();
    });

    try {
      await session.prompt(request.prompt);
    } catch (err: any) {
      stream.markdown(`\n\n**Error:** ${err?.message || String(err)}`);
    } finally {
      subscription.dispose();
    }
  }

  public dispose(): void {
    this.participant.dispose();
  }
}
