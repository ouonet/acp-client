/**
 * Multi-Session Hub & Session Forking Engine
 */

import { randomUUID } from 'node:crypto';
import type { IProcessPort, IStoragePort, Disposable } from '../ports';
import { SessionError } from '../errors';
import type {
  ThinkingLevel,
  ForkSessionOptions,
  SessionSummary,
} from '../types/session';
import type { AcpClientAdapter } from '../protocol/acp-client-adapter';
import { Session, type ISession } from './session';

export interface SessionHubOptions {
  processManager: IProcessPort;
  storageManager?: IStoragePort;
  adapterFactory: (agentId: string) => Promise<AcpClientAdapter>;
}

export interface ISessionHub {
  createSession(
    agentId: string,
    title?: string,
    options?: { model?: string; thinkingLevel?: ThinkingLevel; cwd?: string }
  ): Promise<ISession>;
  forkSession(sourceSessionId: string, options?: ForkSessionOptions): Promise<ISession>;
  getSession(sessionId: string): ISession | undefined;
  listSessions(): SessionSummary[];
  deleteSession(sessionId: string): Promise<void>;
  setActiveSession(sessionId: string): void;
  getActiveSession(): ISession | undefined;
  onSessionListChange(listener: (sessions: SessionSummary[]) => void): Disposable;
  onActiveSessionChange(listener: (session: ISession | undefined) => void): Disposable;
  dispose(): Promise<void>;
}

export class SessionHub implements ISessionHub {
  private readonly processManager: IProcessPort;
  private readonly storageManager?: IStoragePort;
  private readonly adapterFactory: (agentId: string) => Promise<AcpClientAdapter>;

  private readonly sessions = new Map<string, Session>();
  private activeSessionId?: string;

  private readonly sessionListListeners = new Set<(sessions: SessionSummary[]) => void>();
  private readonly activeSessionListeners = new Set<(session: ISession | undefined) => void>();
  private processStatusSubscription?: Disposable;

  constructor(options: SessionHubOptions) {
    this.processManager = options.processManager;
    this.storageManager = options.storageManager;
    this.adapterFactory = options.adapterFactory;

    // Listen to process crashes for crash cascade
    this.processStatusSubscription = this.processManager.onStatusChange((event) => {
      if (event.status === 'error') {
        const errorReason = event.error || 'Agent process crashed unexpectedly';
        for (const session of this.sessions.values()) {
          if (session.agentId === event.agentId) {
            session.handleProcessCrash(errorReason);
          }
        }
        this.notifySessionListChange();
      }
    });
  }

  public async createSession(
    agentId: string,
    title?: string,
    options?: { model?: string; thinkingLevel?: ThinkingLevel; cwd?: string }
  ): Promise<ISession> {
    const adapter = await this.adapterFactory(agentId);
    const cwd = options?.cwd || process.cwd();

    // Call ACP newSession
    const { sessionId } = await adapter.newSession(cwd);

    const session = new Session({
      id: sessionId,
      agentId,
      title: title || 'New Session',
      model: options?.model,
      thinkingLevel: options?.thinkingLevel,
      adapter,
      onSave: async (s) => {
        await this.storageManager?.saveSession(s.serialize());
        this.notifySessionListChange();
      },
    });

    this.sessions.set(sessionId, session);
    this.setActiveSession(sessionId);
    this.notifySessionListChange();

    await this.storageManager?.saveSession(session.serialize());

    return session;
  }

  public async forkSession(sourceSessionId: string, options?: ForkSessionOptions): Promise<ISession> {
    let source = this.sessions.get(sourceSessionId);

    if (!source && this.storageManager) {
      const saved = await this.storageManager.loadSession(sourceSessionId);
      if (saved) {
        const adapter = await this.adapterFactory(saved.agentId);
        source = new Session({
          ...saved,
          adapter,
          onSave: async (s) => {
            await this.storageManager?.saveSession(s.serialize());
            this.notifySessionListChange();
          },
        });
        this.sessions.set(sourceSessionId, source);
      }
    }

    if (!source) {
      throw new SessionError(sourceSessionId, `Cannot fork: source session not found`);
    }

    const targetAgentId = options?.newAgentId || source.agentId;
    const adapter = await this.adapterFactory(targetAgentId);
    const newSessionId = randomUUID();

    // Slice messages up to upToMessageIndex if provided
    let clonedMessages = source.serialize().messages;
    if (options?.upToMessageIndex !== undefined && options.upToMessageIndex >= 0) {
      clonedMessages = clonedMessages.slice(0, options.upToMessageIndex + 1);
    }

    const forkedSession = new Session({
      id: newSessionId,
      agentId: targetAgentId,
      title: options?.title || `${source.title} (Fork)`,
      model: options?.newModel || source.model,
      thinkingLevel: source.thinkingLevel,
      messages: clonedMessages,
      parentSessionId: sourceSessionId,
      forkedFromMessageIndex: options?.upToMessageIndex,
      adapter,
      onSave: async (s) => {
        await this.storageManager?.saveSession(s.serialize());
        this.notifySessionListChange();
      },
    });

    this.sessions.set(newSessionId, forkedSession);
    this.setActiveSession(newSessionId);
    this.notifySessionListChange();

    await this.storageManager?.saveSession(forkedSession.serialize());

    return forkedSession;
  }

  public getSession(sessionId: string): ISession | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): SessionSummary[] {
    const list: SessionSummary[] = [];
    for (const session of this.sessions.values()) {
      list.push({
        id: session.id,
        agentId: session.agentId,
        title: session.title,
        model: session.model,
        thinkingLevel: session.thinkingLevel,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        status: session.status,
        messageCount: session.messages.length,
        parentSessionId: session.parentSessionId,
      });
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.dispose();
      this.sessions.delete(sessionId);
      await this.storageManager?.deleteSavedSession(sessionId);

      if (this.activeSessionId === sessionId) {
        const remaining = Array.from(this.sessions.keys());
        this.setActiveSession(remaining.length > 0 ? remaining[0] : '');
      }

      this.notifySessionListChange();
    }
  }

  public setActiveSession(sessionId: string): void {
    if (this.activeSessionId === sessionId) return;

    this.activeSessionId = sessionId;
    const active = sessionId ? this.sessions.get(sessionId) : undefined;

    for (const listener of this.activeSessionListeners) {
      try {
        listener(active);
      } catch (err) {
        console.error('[SessionHub] error in activeSession listener:', err);
      }
    }
  }

  public getActiveSession(): ISession | undefined {
    if (!this.activeSessionId) return undefined;
    return this.sessions.get(this.activeSessionId);
  }

  public onSessionListChange(listener: (sessions: SessionSummary[]) => void): Disposable {
    this.sessionListListeners.add(listener);
    return {
      dispose: () => {
        this.sessionListListeners.delete(listener);
      },
    };
  }

  public onActiveSessionChange(listener: (session: ISession | undefined) => void): Disposable {
    this.activeSessionListeners.add(listener);
    return {
      dispose: () => {
        this.activeSessionListeners.delete(listener);
      },
    };
  }

  public async dispose(): Promise<void> {
    this.processStatusSubscription?.dispose();
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
    this.sessionListListeners.clear();
    this.activeSessionListeners.clear();
  }

  private notifySessionListChange(): void {
    const summaryList = this.listSessions();
    for (const listener of this.sessionListListeners) {
      try {
        listener(summaryList);
      } catch (err) {
        console.error('[SessionHub] error in sessionList listener:', err);
      }
    }
  }
}
