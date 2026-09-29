/**
 * ACP Session Domain Model & Strict FSM
 */

import type { Disposable } from '../ports';
import { SessionError } from '../errors';
import type {
  SessionStatus,
  ThinkingLevel,
  ContentBlock,
  PromptOptions,
  MessageChunk,
  SessionData,
  SessionEvent,
} from '../types/session';
import type { AcpClientAdapter, SessionUpdateEvent } from '../protocol/acp-client-adapter';

export interface SessionOptions {
  id: string;
  agentId: string;
  title?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  createdAt?: number;
  updatedAt?: number;
  status?: SessionStatus;
  messages?: MessageChunk[];
  parentSessionId?: string;
  forkedFromMessageIndex?: number;
  adapter: AcpClientAdapter;
  onSave?: (session: Session) => Promise<void>;
}

export interface ISession {
  readonly id: string;
  readonly agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: SessionStatus;
  readonly parentSessionId?: string;
  readonly forkedFromMessageIndex?: number;
  readonly messages: readonly MessageChunk[];

  prompt(text: string | ContentBlock[], options?: PromptOptions): Promise<void>;
  cancel(): Promise<void>;
  respondPermission(
    requestId: string,
    decision: 'allow' | 'deny' | 'always_allow_session',
    options?: any
  ): Promise<void>;
  onEvent(listener: (event: SessionEvent) => void): Disposable;
  serialize(): SessionData;
}

export class Session implements ISession {
  readonly id: string;
  readonly agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  readonly createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  readonly parentSessionId?: string;
  readonly forkedFromMessageIndex?: number;
  messages: MessageChunk[];

  private readonly adapter: AcpClientAdapter;
  private readonly onSave?: (session: Session) => Promise<void>;
  private readonly eventListeners = new Set<(event: SessionEvent) => void>();
  private readonly allowedToolsInSession = new Set<string>();

  private pendingApproval?: {
    requestId: string;
    toolTitle: string;
    resolve: (val: any) => void;
    reject: (err: any) => void;
  };

  private currentPromptReject?: (err: any) => void;
  private updateSubscription?: Disposable;

  constructor(options: SessionOptions) {
    this.id = options.id;
    this.agentId = options.agentId;
    this.title = options.title || 'New Session';
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel;
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || this.createdAt;
    this.status = options.status || 'idle';
    this.messages = options.messages ? JSON.parse(JSON.stringify(options.messages)) : [];
    this.parentSessionId = options.parentSessionId;
    this.forkedFromMessageIndex = options.forkedFromMessageIndex;
    this.adapter = options.adapter;
    this.onSave = options.onSave;

    // Subscribe to adapter session updates
    this.updateSubscription = this.adapter.onSessionUpdate((event: SessionUpdateEvent) => {
      if (event.sessionId === this.id) {
        this.handleSessionUpdate(event.update);
      }
    });
  }

  public async prompt(text: string | ContentBlock[], options?: PromptOptions): Promise<void> {
    if (this.status !== 'idle') {
      throw new SessionError(this.id, `Cannot prompt while session is in status: ${this.status}`);
    }

    this.setStatus('streaming');

    // Append user message
    this.messages.push({
      role: 'user',
      content: text,
    });

    // Append assistant placeholder
    const assistantMessage: MessageChunk = {
      role: 'assistant',
      content: '',
      thinking: '',
      toolCalls: [],
    };
    this.messages.push(assistantMessage);

    const meta = options
      ? {
          model: options.model || this.model,
          thinkingLevel: options.thinkingLevel || this.thinkingLevel,
          contextFiles: options.contextFiles,
        }
      : undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        this.currentPromptReject = reject;

        this.adapter
          .prompt(this.id, text, meta)
          .then(() => {
            this.currentPromptReject = undefined;
            resolve();
          })
          .catch((err) => {
            this.currentPromptReject = undefined;
            reject(err);
          });
      });

      this.setStatus('idle');
      this.updatedAt = Date.now();
      await this.onSave?.(this);
    } catch (err: any) {
      if ((this.status as SessionStatus) !== 'error') {
        this.setStatus('error');
      }
      throw err;
    }
  }

  public async cancel(): Promise<void> {
    if (this.status === 'streaming' || this.status === 'waiting_approval') {
      try {
        await this.adapter.cancel(this.id);
      } catch {
        // ignore
      }
      this.setStatus('idle');
    }
  }

  public requestApproval(requestId: string, toolTitle: string, options: any[]): Promise<any> {
    if (this.allowedToolsInSession.has(toolTitle)) {
      const allowOpt = options.find((o) => o.kind?.startsWith('allow')) || options[0];
      return Promise.resolve({
        outcome: {
          outcome: 'selected',
          optionId: allowOpt?.optionId || 'allow',
        },
      });
    }

    this.setStatus('waiting_approval');

    this.emitEvent({
      type: 'permission_request',
      sessionId: this.id,
      payload: { requestId, toolTitle, options },
    });

    return new Promise((resolve, reject) => {
      this.pendingApproval = { requestId, toolTitle, resolve, reject };
    });
  }

  public async respondPermission(
    requestId: string,
    decision: 'allow' | 'deny' | 'always_allow_session',
    options?: any
  ): Promise<void> {
    if (this.status !== 'waiting_approval') {
      throw new SessionError(this.id, 'Cannot respond to permission when not in waiting_approval state');
    }

    if (!this.pendingApproval || this.pendingApproval.requestId !== requestId) {
      throw new SessionError(this.id, `No pending approval request found for id: ${requestId}`);
    }

    const { resolve, toolTitle } = this.pendingApproval;
    this.pendingApproval = undefined;

    if (decision === 'always_allow_session') {
      this.allowedToolsInSession.add(toolTitle);
    }

    this.setStatus('streaming');

    const isAllow = decision === 'allow' || decision === 'always_allow_session';
    resolve({
      outcome: {
        outcome: isAllow ? 'selected' : 'cancelled',
        ...options,
      },
    });
  }

  public handleProcessCrash(reason: string): void {
    this.setStatus('error');

    this.emitEvent({
      type: 'error',
      sessionId: this.id,
      payload: { message: reason },
    });

    if (this.pendingApproval) {
      this.pendingApproval.reject(new SessionError(this.id, `Process crashed: ${reason}`));
      this.pendingApproval = undefined;
    }

    if (this.currentPromptReject) {
      this.currentPromptReject(new SessionError(this.id, `Process crashed: ${reason}`));
      this.currentPromptReject = undefined;
    }
  }

  public onEvent(listener: (event: SessionEvent) => void): Disposable {
    this.eventListeners.add(listener);
    return {
      dispose: () => {
        this.eventListeners.delete(listener);
      },
    };
  }

  public serialize(): SessionData {
    return JSON.parse(
      JSON.stringify({
        id: this.id,
        agentId: this.agentId,
        title: this.title,
        model: this.model,
        thinkingLevel: this.thinkingLevel,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        status: this.status,
        messages: this.messages,
        parentSessionId: this.parentSessionId,
        forkedFromMessageIndex: this.forkedFromMessageIndex,
      })
    );
  }

  public dispose(): void {
    this.updateSubscription?.dispose();
    this.eventListeners.clear();
  }

  private setStatus(newStatus: SessionStatus): void {
    this.status = newStatus;
    this.emitEvent({
      type: 'status_change',
      sessionId: this.id,
      payload: { status: newStatus },
    });
  }

  private handleSessionUpdate(update: any): void {
    const lastMsg = this.messages[this.messages.length - 1];

    switch (update.sessionUpdate) {
      case 'agent_thought_chunk': {
        const text = update.content?.text || '';
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.thinking = (lastMsg.thinking || '') + text;
        }
        this.emitEvent({
          type: 'thinking',
          sessionId: this.id,
          payload: update,
        });
        break;
      }
      case 'agent_message_chunk': {
        const text = update.content?.text || '';
        if (lastMsg && lastMsg.role === 'assistant') {
          if (typeof lastMsg.content === 'string') {
            lastMsg.content += text;
          }
        }
        this.emitEvent({
          type: 'chunk',
          sessionId: this.id,
          payload: update,
        });
        break;
      }
      case 'tool_call': {
        if (lastMsg && lastMsg.role === 'assistant') {
          if (!lastMsg.toolCalls) lastMsg.toolCalls = [];
          lastMsg.toolCalls.push({
            id: update.toolCallId,
            name: update.title || 'tool',
            input: update.input,
            status: update.status || 'pending',
          });
        }
        this.emitEvent({
          type: 'tool_call',
          sessionId: this.id,
          payload: update,
        });
        break;
      }
      case 'tool_call_update': {
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls) {
          const tc = lastMsg.toolCalls.find((t) => t.id === update.toolCallId);
          if (tc) {
            tc.status = update.status || tc.status;
            if (update.output) tc.output = update.output;
          }
        }
        this.emitEvent({
          type: 'tool_result',
          sessionId: this.id,
          payload: update,
        });
        break;
      }
      default:
        break;
    }
  }

  private emitEvent(event: SessionEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[Session ${this.id}] error in event listener:`, err);
      }
    }
  }
}
