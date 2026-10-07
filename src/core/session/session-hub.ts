import type { IProcessPort, IStoragePort, Disposable } from "../ports";
import { SessionError } from "../errors";
import type {
  ThinkingLevel,
  ForkSessionOptions,
  SessionSummary,
  AgentConnectionSummary,
} from "../types/session";
import type {
  AcpClientAdapter,
  NewSessionResult,
} from "../protocol/acp-client-adapter";
import { Session, type ISession } from "./session";
import {
  runtime,
  preempt,
  guarded,
  serial,
  deadline,
  releaseCurrent,
  assertReplaceable,
  type AgentRuntime,
} from "./agent-runtime";
export type { ISession };
export interface SessionHubOptions {
  processManager: IProcessPort;
  storageManager?: IStoragePort;
  adapterFactory: (agentId: string) => Promise<AcpClientAdapter>;
  onDisconnect?: (agentId: string) => Promise<void>;
}
export interface ISessionHub {
  connectAgent(agentId: string): Promise<void>;
  getActiveAgentId(): string | undefined;
  setActiveAgent(agentId: string): void;
  listConnections(): AgentConnectionSummary[];
  getConnection(agentId: string): AgentConnectionSummary | undefined;
  disconnectAgent(agentId: string): Promise<void>;
  closeSession(sessionId: string, agentId?: string): Promise<void>;
  createSession(
    agentId: string,
    title?: string,
    options?: { model?: string; thinkingLevel?: ThinkingLevel; cwd?: string },
  ): Promise<ISession>;
  forkSession(
    sourceSessionId: string,
    options?: ForkSessionOptions,
  ): Promise<ISession>;
  rewindSession(sessionId: string, upToMessageIndex: number, agentId?: string): Promise<ISession>;
  getSession(sessionId: string, agentId?: string): ISession | undefined;
  restoreSession(
    sessionId: string,
    agentId?: string,
    cwd?: string,
  ): Promise<ISession | undefined>;
  listSessions(): SessionSummary[];
  listAgentSessions(
    agentId: string,
    options?: { cwd?: string },
  ): Promise<SessionSummary[]>;
  listAgentSessionPage(
    agentId: string,
    options?: { cwd?: string; cursor?: string },
  ): Promise<{ sessions: SessionSummary[]; nextCursor?: string }>;
  deleteSession(sessionId: string, agentId?: string): Promise<void>;
  setActiveSession(sessionId: string, agentId?: string): void;
  getActiveSession(): ISession | undefined;
  onSessionListChange(
    listener: (sessions: SessionSummary[]) => void,
  ): Disposable;
  onActiveSessionChange(
    listener: (session: ISession | undefined) => void,
  ): Disposable;
  dispose(): Promise<void>;
}
export class SessionHub implements ISessionHub {
  private readonly entries = new Map<string, AgentRuntime>();
  private readonly generations = new Map<string, number>();
  private readonly remoteMeta = new Map<
    string,
    { agentId: string; cwd?: string; title?: string }
  >();
  private activeAgentId?: string;
  private disposed = false;
  private readonly listListeners = new Set<
    (sessions: SessionSummary[]) => void
  >();
  private readonly activeListeners = new Set<
    (session: ISession | undefined) => void
  >();
  private readonly processSubscription: Disposable;
  constructor(private readonly options: SessionHubOptions) {
    this.processSubscription = options.processManager.onStatusChange(
      (event) => {
        const entry = this.entries.get(event.agentId);
        if (!entry || entry.disconnect) return;
        entry.summary.status = event.status;
        if (
          event.status === "error" ||
          (event.status === "stopped" && entry.summary.initialized)
        )
          this.crash(entry, event.error || "Agent process disconnected");
        this.notify();
      },
    );
  }
  private key(agentId: string, sessionId: string) {
    return JSON.stringify([agentId, sessionId]);
  }
  private valid(entry: AgentRuntime, generation = entry.summary.generation) {
    return (
      this.entries.get(entry.summary.agentId) === entry &&
      entry.summary.generation === generation &&
      !entry.disconnect &&
      !this.disposed
    );
  }
  private crash(entry: AgentRuntime, reason: string) {
    entry.summary.generation++;
    this.generations.set(entry.summary.agentId, entry.summary.generation);
    entry.summary.status = "error";
    entry.summary.initialized = false;
    entry.summary.error = reason;
    preempt(entry, reason);
    entry.session?.detach(reason);
    entry.connection = undefined;
    entry.closeSubscription?.dispose();
  }
  public connectAgent(agentId: string): Promise<void> {
    return this.connectRuntime(agentId, true);
  }
  private connectRuntime(agentId: string, select: boolean): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("SessionHub disposed"));
    let entry = this.entries.get(agentId);
    if (entry?.disconnect || entry?.cleanup)
      return Promise.reject(new Error("Agent disconnecting or cleaning up"));
    if (entry?.connection) {
      if (select) this.setActiveAgent(agentId);
      return entry.connection;
    }
    if (entry?.summary.initialized) {
      if (select) this.setActiveAgent(agentId);
      return Promise.resolve();
    }
    if (!entry) {
      entry = runtime(agentId, (this.generations.get(agentId) || 0) + 1);
      this.entries.set(agentId, entry);
    } else {
      entry.summary.generation++;
      entry.summary.status = "starting";
      entry.summary.error = undefined;
      entry.closeSubscription?.dispose();
    }
    this.generations.set(agentId, entry.summary.generation);
    if (select) this.activeAgentId = agentId;
    this.notify();
    const current = entry;
    const generation = current.summary.generation;
    const factory = this.options.adapterFactory(agentId);
    factory.then(
      (adapter) => {
        if (!this.valid(current, generation))
          void Promise.resolve()
            .then(() => adapter.close?.())
            .catch((error) => {
              current.summary.error = `Adapter cleanup failed: ${error?.message || error}`;
            });
      },
      () => {},
    );
    current.connection = guarded(current, factory, () =>
      this.valid(current, generation),
    )
      .then(async (adapter) => {
        current.adapter = adapter;
        current.summary = {
          agentId,
          generation,
          status: "running",
          initialized: true,
          capabilities: adapter.getAgentCapabilities?.(),
          clientCapabilities: adapter.getClientCapabilities?.(),
          protocolVersion: adapter.getProtocolVersion?.(),
          agentInfo: adapter.getAgentInfo?.(),
        };
        current.closeSubscription = adapter.onClose?.(() => {
          if (this.valid(current, generation)) {
            this.crash(current, "Agent transport disconnected");
            this.notify();
          }
        });
        if (
          current.session &&
          !current.session.attached &&
          current.summary.capabilities?.loadSession
        ) {
          await this.load(current, current.session.id, current.session.cwd);
        }
        this.notify();
      })
      .catch((error) => {
        if (this.valid(current, generation)) {
          this.failConnection(current, error);
        }
        throw error;
      })
      .finally(() => {
        if (current.summary.generation === generation)
          current.connection = undefined;
      });
    return current.connection;
  }
  private failConnection(entry: AgentRuntime, error: unknown): void {
    entry.summary.generation++;
    this.generations.set(entry.summary.agentId, entry.summary.generation);
    entry.summary.status = "error";
    entry.summary.initialized = false;
    entry.summary.error =
      error instanceof Error ? error.message : String(error);
    preempt(entry, "Agent connection failed");
    entry.session?.detach("Agent connection failed");
    entry.closeSubscription?.dispose();
    entry.connection = undefined;
    entry.cleanup = (async () => {
      try {
        await deadline(
          Promise.resolve().then(() =>
            this.options.onDisconnect?.(entry.summary.agentId),
          ),
          2000,
        ).catch((cleanupError) => {
          entry.summary.error += `; adapter cleanup: ${cleanupError?.message || cleanupError}`;
        });
        await deadline(
          Promise.resolve().then(() => entry.adapter?.close?.()),
          2000,
        ).catch(() => {});
        await this.options.processManager.stop(entry.summary.agentId);
      } catch (cleanupError) {
        entry.summary.error += `; process cleanup: ${(cleanupError as Error)?.message || cleanupError}`;
      } finally {
        entry.adapter = undefined;
        entry.cleanup = undefined;
        this.notify();
      }
    })();
    this.notify();
  }
  private async connected(agentId: string, select = false) {
    await this.connectRuntime(agentId, select);
    const entry = this.entries.get(agentId);
    if (!entry?.adapter || !entry.summary.initialized)
      throw new Error("Agent disconnected");
    return entry;
  }
  public getActiveAgentId() {
    return this.activeAgentId;
  }
  public setActiveAgent(agentId: string) {
    if (!this.entries.has(agentId))
      throw new Error(`Unknown Agent: ${agentId}`);
    this.activeAgentId = agentId;
    this.notify();
  }
  public listConnections() {
    return [...this.entries.values()].map((entry) =>
      this.getConnection(entry.summary.agentId)!,
    );
  }
  public getConnection(agentId: string) {
    const summary = this.entries.get(agentId)?.summary;
    return summary
      ? (JSON.parse(JSON.stringify(summary)) as AgentConnectionSummary)
      : undefined;
  }
  private resolveAgent(
    sessionId: string,
    agentId?: string,
  ): string | undefined {
    if (agentId) return agentId;
    const ids = new Set<string>();
    for (const [id, entry] of this.entries)
      if (entry.session?.id === sessionId) ids.add(id);
    for (const meta of this.remoteMeta.values())
      if (this.remoteMeta.get(this.key(meta.agentId, sessionId)) === meta)
        ids.add(meta.agentId);
    if (ids.size > 1)
      throw new SessionError(
        sessionId,
        "Ambiguous Session ID; provide agentId",
      );
    return [...ids][0];
  }
  public getSession(sessionId: string, agentId?: string) {
    const id = this.resolveAgent(sessionId, agentId);
    const session = id ? this.entries.get(id)?.session : undefined;
    return session?.id === sessionId ? session : undefined;
  }
  public getActiveSession() {
    return this.activeAgentId
      ? this.entries.get(this.activeAgentId)?.session
      : undefined;
  }
  public setActiveSession(sessionId: string, agentId?: string) {
    const session = this.getSession(sessionId, agentId);
    if (!session) throw new SessionError(sessionId, "Session not found");
    this.setActiveAgent(session.agentId);
  }
  private publish(entry: AgentRuntime, session: Session) {
    entry.session?.dispose();
    entry.session = session;
    entry.staging = undefined;
    session.onEvent(() => this.notify(false));
    this.notify();
    return session;
  }
  private make(
    entry: AgentRuntime,
    result: NewSessionResult,
    options: Partial<ConstructorParameters<typeof Session>[0]> = {},
  ) {
    if (!result.sessionId)
      throw new Error("Agent returned an invalid Session ID");
    return new Session({
      ...options,
      id: result.sessionId,
      agentId: entry.summary.agentId,
      adapter: entry.adapter!,
      runtimeRevision: entry.revision,
      attached: true,
      model: result.currentModel,
      thinkingLevel: result.currentThinkingLevel,
      configOptions: result.configOptions,
      availableModels: result.models,
      availableThinkingLevels: result.thinkingLevels,
      availableCommands: result.availableCommands,
      modes: result.modes,
      capabilities: entry.summary.capabilities,
    });
  }
  public async createSession(
    agentId: string,
    title?: string,
    options: {
      model?: string;
      thinkingLevel?: ThinkingLevel;
      cwd?: string;
    } = {},
  ) {
    const entry = await this.connected(agentId, true);
    return serial(entry, async () => {
      releaseCurrent(entry);
      const revision = entry.revision;
      const generation = entry.summary.generation;
      const cwd = options.cwd || process.cwd();
      const result = await guarded(
        entry,
        entry.adapter!.newSession(cwd),
        () => this.valid(entry, generation) && entry.revision === revision,
      );
      return this.publish(
        entry,
        this.make(entry, result, { ...options, cwd, title }),
      );
    });
  }
  private async load(entry: AgentRuntime, sessionId: string, cwd?: string) {
    if (!entry.summary.capabilities?.loadSession)
      throw new Error("Agent does not support session/load");
    const meta = this.remoteMeta.get(
      this.key(entry.summary.agentId, sessionId),
    );
    const targetCwd = meta?.cwd || cwd || entry.session?.cwd || process.cwd();
    releaseCurrent(entry);
    const revision = entry.revision;
    const generation = entry.summary.generation;
    const staging = this.make(
      entry,
      { sessionId },
      {
        cwd: targetCwd,
        title: meta?.title || entry.session?.title || "Session",
      },
    );
    entry.staging = staging;
    try {
      const result = await guarded(
        entry,
        entry.adapter!.loadSession(sessionId, targetCwd, []),
        () => this.valid(entry, generation) && entry.revision === revision,
      );
      Object.assign(staging, {
        model: result.currentModel,
        thinkingLevel: result.currentThinkingLevel,
        availableModels: result.models || [],
        availableThinkingLevels: result.thinkingLevels || [],
        availableCommands:
          result.availableCommands || staging.availableCommands,
        modes: result.modes,
      });
      if (Array.isArray(result.configOptions)) staging.replaceConfigOptions(result.configOptions);
      return this.publish(entry, staging);
    } catch (error) {
      staging.dispose();
      if (entry.staging === staging) entry.staging = undefined;
      this.notify();
      throw error;
    }
  }
  public async restoreSession(
    sessionId: string,
    agentId?: string,
    cwd?: string,
  ) {
    const target = this.resolveAgent(sessionId, agentId);
    if (!target) return undefined;
    const entry = await this.connected(target, true);
    if (entry.session?.id === sessionId && entry.session.attached) {
      return entry.session;
    }
    return serial(entry, () => this.load(entry, sessionId, cwd));
  }
  public async forkSession(
    sourceSessionId: string,
    options: ForkSessionOptions = {},
  ) {
    const source = this.getSession(sourceSessionId, options.sourceAgentId);
    if (!source)
      throw new SessionError(
        sourceSessionId,
        "Cannot fork: source session not found",
      );
    const snapshot = source.serialize();
    const target = options.newAgentId || source.agentId;
    const entry = await this.connected(target, true);
    return serial(entry, async () => {
      assertReplaceable(entry);
      const copied = snapshot.messages.slice(
        0,
        options.upToMessageIndex === undefined
          ? undefined
          : options.upToMessageIndex + 1,
      );
      releaseCurrent(entry);
      const revision = entry.revision;
      const generation = entry.summary.generation;
      const adapter = entry.adapter!;
      const cwd = source.cwd || process.cwd();
      const work = (async () => {
        const native = target === source.agentId
          ? await adapter.forkSession?.(
              sourceSessionId,
              cwd,
              ...(typeof options.upToMessageIndex === "number" ? [options.upToMessageIndex] : []),
            )
          : undefined;
        return { native, result: native ?? (await adapter.newSession(cwd)) };
      })();
      const { native, result } = await guarded(
        entry,
        work,
        () => this.valid(entry, generation) && entry.revision === revision,
      );
      if (result.sessionId === sourceSessionId && target === source.agentId)
        throw new SessionError(
          sourceSessionId,
          "Agent returned an invalid fork Session ID",
        );
      return this.publish(
        entry,
        this.make(entry, result, {
          cwd,
          title: options.title || `${snapshot.title} (Fork)`,
          model: options.newModel || snapshot.model,
          thinkingLevel: snapshot.thinkingLevel,
          messages: copied,
          initialContext: native ? undefined : copied,
          parentSessionId: sourceSessionId,
          forkedFromMessageIndex: options.upToMessageIndex,
        }),
      );
    });
  }
  public async rewindSession(sessionId: string, upToMessageIndex: number, agentId?: string) {
    const source = this.getSession(sessionId, agentId);
    if (!source) throw new SessionError(sessionId, "Cannot rewind: source session not found");
    if (!Number.isInteger(upToMessageIndex)) throw new SessionError(sessionId, "Cannot rewind: missing message boundary");
    const entry = await this.connected(source.agentId);
    return serial(entry, async () => {
      assertReplaceable(entry);
      await entry.adapter!.rewindSession(source.id, upToMessageIndex);
      source.truncateTo(upToMessageIndex);
      this.notify();
      return source;
    });
  }
  public async listAgentSessionPage(
    agentId: string,
    options: { cwd?: string; cursor?: string } = {},
  ) {
    const entry = await this.connected(agentId);
    const generation = entry.summary.generation;
    if (!entry.summary.capabilities?.sessionCapabilities?.list)
      throw new Error("Agent does not support session/list");
    const page = await guarded(
      entry,
      entry.adapter!.listSessionPage(options),
      () => this.valid(entry, generation),
    );
    const sessions = page.sessions.map((info) => {
      this.remoteMeta.set(this.key(agentId, info.sessionId), {
        agentId,
        cwd: info.cwd,
        title: info.title,
      });
      const current = this.getSession(info.sessionId, agentId);
      const timestamp = info.updatedAt ? Date.parse(info.updatedAt) : 0;
      return {
        id: info.sessionId,
        agentId,
        title: info.title || current?.title || "Session",
        cwd: info.cwd,
        createdAt: current?.createdAt || timestamp,
        updatedAt: Number.isFinite(timestamp) ? timestamp : 0,
        status: current?.attached ? current.status : undefined,
        messageCount: current?.messages.length || 0,
      } as SessionSummary;
    });
    // session/new may not enter remote history until its first prompt. The
    // attached fork already has an acknowledged Agent ID and is loadable here.
    const fork = entry.session;
    if (
      !options.cursor && fork?.attached && fork.parentSessionId &&
      (!options.cwd || options.cwd === fork.cwd) &&
      !sessions.some(session => session.id === fork.id)
    ) {
      sessions.unshift({
        id: fork.id, agentId, title: fork.title, cwd: fork.cwd,
        createdAt: fork.createdAt, updatedAt: fork.updatedAt,
        status: fork.status, messageCount: fork.messages.length,
      });
    }
    return { sessions, nextCursor: page.nextCursor };
  }
  public async listAgentSessions(
    agentId: string,
    options: { cwd?: string } = {},
  ) {
    if (this.options.processManager.getStatus(agentId) !== "running") return [];
    return (await this.listAgentSessionPage(agentId, options)).sessions;
  }
  public listSessions(): SessionSummary[] {
    return [...this.entries.values()].flatMap((entry) => {
      const session = entry.session;
      if (!session) return [];
      const { messages, ...data } = session.serialize();
      return [{ ...data, messageCount: messages.length }];
    });
  }
  public async closeSession(sessionId: string, agentId?: string) {
    const target = this.resolveAgent(sessionId, agentId);
    if (!target) return;
    const entry = this.entries.get(target);
    if (!entry) return;
    const session = this.getSession(sessionId, target);
    preempt(entry, "Session closed");
    session?.detach("Session closed");
    this.notify();
    const cleanup = this.cleanupRemote(entry, sessionId);
    entry.queue = cleanup;
    await cleanup;
    if (entry.session === session) {
      session?.dispose();
      entry.session = undefined;
    }
    this.notify();
  }
  private async cleanupRemote(entry: AgentRuntime, sessionId: string) {
    const adapter = entry.adapter;
    if (!adapter) return;
    const work = Promise.allSettled([
      Promise.resolve().then(() => adapter.cancel?.(sessionId)),
      ...(entry.summary.capabilities?.sessionCapabilities?.close
        ? [Promise.resolve().then(() => adapter.closeSession?.(sessionId))]
        : []),
    ]).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    });
    await deadline(work, 2000).catch((error) => {
      entry.summary.error = `Session cleanup failed: ${error?.message || error}`;
    });
  }
  public async deleteSession(sessionId: string, agentId?: string) {
    const target = this.resolveAgent(sessionId, agentId);
    if (!target) throw new SessionError(sessionId, "Session not found");
    const entry = await this.connected(target);
    return serial(entry, async () => {
      assertReplaceable(entry);
      if (!entry.summary.capabilities?.sessionCapabilities?.delete)
        throw new Error("Agent does not support session/delete");
      const generation = entry.summary.generation;
      const deleted = await guarded(
        entry,
        entry.adapter!.deleteSession(sessionId),
        () => this.valid(entry, generation),
      );
      if (!deleted) throw new Error("Agent did not delete Session");
      const session = this.getSession(sessionId, target);
      session?.dispose();
      if (entry.session === session) entry.session = undefined;
      this.remoteMeta.delete(this.key(target, sessionId));
      this.notify();
    });
  }
  public disconnectAgent(agentId: string): Promise<void> {
    const entry = this.entries.get(agentId);
    if (!entry) return Promise.resolve();
    if (entry.cleanup)
      return entry.cleanup.then(() => this.disconnectAgent(agentId));
    if (entry.disconnect) return entry.disconnect;
    entry.summary.generation++;
    this.generations.set(agentId, entry.summary.generation);
    entry.summary.initialized = false;
    preempt(entry, "Agent disconnected");
    entry.session?.detach("Agent disconnected");
    entry.closeSubscription?.dispose();
    entry.disconnect = (async () => {
      if (entry.session) await this.cleanupRemote(entry, entry.session.id);
      await deadline(Promise.resolve(entry.adapter?.close?.()), 2000).catch(
        () => {},
      );
      try {
        await this.options.onDisconnect?.(agentId);
        await this.options.processManager.stop(agentId);
        this.entries.delete(agentId);
        for (const [key, meta] of this.remoteMeta)
          if (meta.agentId === agentId) this.remoteMeta.delete(key);
        if (this.activeAgentId === agentId)
          this.activeAgentId = [...this.entries.keys()][0];
        entry.session?.dispose();
      } catch (error) {
        entry.summary.status = "error";
        entry.summary.error = String((error as Error).message);
        throw error;
      } finally {
        entry.disconnect = undefined;
        entry.connection = undefined;
        this.notify();
      }
    })();
    return entry.disconnect;
  }
  public onSessionListChange(listener: (sessions: SessionSummary[]) => void) {
    this.listListeners.add(listener);
    return {
      dispose: () => {
        this.listListeners.delete(listener);
      },
    };
  }
  public onActiveSessionChange(
    listener: (session: ISession | undefined) => void,
  ) {
    this.activeListeners.add(listener);
    return {
      dispose: () => {
        this.activeListeners.delete(listener);
      },
    };
  }
  private notify(active = true) {
    for (const listener of this.listListeners) {
      try {
        listener(this.listSessions());
      } catch {}
    }
    if (active)
      for (const listener of this.activeListeners) {
        try {
          listener(this.getActiveSession());
        } catch {}
      }
  }
  public async dispose() {
    this.disposed = true;
    this.processSubscription.dispose();
    await Promise.allSettled(
      [...this.entries.keys()].map((id) => this.disconnectAgent(id)),
    );
    this.listListeners.clear();
    this.activeListeners.clear();
  }
}
