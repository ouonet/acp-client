/**
 * ACP Session Domain Model & Strict FSM
 */

import type { Disposable } from "../ports";
import { deadline, QUICK_OPERATION_MS } from './agent-runtime';
import { SessionError } from "../errors";
import type {
  SessionStatus,
  ThinkingLevel,
  ContentBlock,
  PromptOptions,
  MessageChunk,
  ToolCall,
  SessionData,
  SessionEvent,
  AvailableCommand,
  CompactionEntry,
} from "../types/session";
import { parseConfigOptions, parseModes, parseCurrentModeId } from "../protocol/acp-client-adapter";
import type {
  AcpClientAdapter,
  ParsedConfigOptions,
  SessionUpdateEvent,
} from "../protocol/acp-client-adapter";

export interface PendingApproval {
  readonly sessionId?: string;
  readonly requestId: string;
  readonly toolTitle: string;
  readonly toolName?: string;
  readonly toolKind?: string;
  readonly toolCallId?: string;
  readonly toolInput?: unknown;
  readonly toolContent?: unknown;
  readonly toolLocations?: unknown;
  readonly options: readonly { optionId: string; name: string; kind: string }[];
}

export interface ToolApprovalDetail {
  toolName?: string;
  toolKind?: string;
  toolCallId?: string;
  toolInput?: unknown;
  toolContent?: unknown;
  toolLocations?: unknown;
}

function isAllowOptionKind(kind: unknown): kind is string {
  return typeof kind === "string" &&
    (kind.startsWith("allow") || kind === "always" || kind === "always_allow_session");
}

function isAlwaysAllowOptionKind(kind: unknown): boolean {
  return kind === "allow_always" || kind === "always" || kind === "always_allow_session";
}

function isRejectOptionKind(kind: unknown): boolean {
  return kind === "deny" || (typeof kind === "string" && kind.startsWith("reject"));
}

export interface SessionOptions {
  initialContext?: MessageChunk[];
  id: string;
  agentId: string;
  title?: string;
  cwd?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  createdAt?: number;
  updatedAt?: number;
  status?: SessionStatus;
  messages?: MessageChunk[];
  parentSessionId?: string;
  forkedFromMessageIndex?: number;
  modelConfigId?: string;
  thinkingConfigId?: string;
  configOptions?: any[];
  availableModels?: string[];
  availableThinkingLevels?: string[];
  availableCommands?: AvailableCommand[];
  capabilities?: any;
  modes?: Array<{ id: string; name: string }> | any;
  currentModeId?: string;
  compactions?: CompactionEntry[];
  adapter: AcpClientAdapter;
  runtimeRevision?: number;
  attached?: boolean;
}

export interface ISession {
  readonly runtimeRevision: number;
  readonly attached: boolean;
  readonly id: string;
  readonly agentId: string;
  readonly cwd?: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  availableModels?: string[];
  availableThinkingLevels?: string[];
  availableCommands?: AvailableCommand[];
  capabilities?: any;
  modes?: Array<{ id: string; name: string }>;
  currentModeId?: string;
  compactions?: CompactionEntry[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: SessionStatus;
  readonly parentSessionId?: string;
  readonly forkedFromMessageIndex?: number;
  readonly messages: readonly MessageChunk[];
  readonly pendingApproval?: PendingApproval;

  getAdapter?(): AcpClientAdapter | undefined;
  setMode?(modeId: string): Promise<void>;
  requestApproval(
    requestId: string,
    toolTitle: string,
    options: any[],
    detail?: ToolApprovalDetail,
  ): Promise<any>;
  prompt(text: string | ContentBlock[], options?: PromptOptions): Promise<void>;
  cancel(): Promise<void>;
  setConfigOption(configId: string, value: string): Promise<void>;
  respondPermission(
    requestId: string,
    decision: "allow" | "deny" | "always_allow_session",
    options?: any,
  ): Promise<void>;
  onEvent(listener: (event: SessionEvent) => void): Disposable;
  serialize(): SessionData;
  attachAdapter(adapter: AcpClientAdapter): void;
  setTitle?(title: string): void;
}

export class Session implements ISession {
  runtimeRevision: number;
  attached: boolean;
  readonly id: string;
  readonly agentId: string;
  readonly cwd?: string;
  private _title = "New Session";
  public get title(): string {
    return this._title;
  }
  public set title(value: string) {
    this.setTitle(value);
  }

  public setTitle(title: string): void {
    const trimmed = (title || "").trim();
    if (!trimmed || this._title === trimmed) return;
    this._title = trimmed;
    this.updatedAt = Date.now();
    this.emitEvent({
      type: "session_info_update",
      sessionId: this.id,
      payload: { title: this._title, updatedAt: this.updatedAt },
    });
  }
  model?: string;
  thinkingLevel?: ThinkingLevel;
  modelConfigId?: string;
  thinkingConfigId?: string;
  availableModels: string[] = [];
  availableThinkingLevels: string[] = [];
  availableCommands: AvailableCommand[] = [];
  capabilities?: any;
  modes?: Array<{ id: string; name: string }>;
  currentModeId?: string;
  compactions: CompactionEntry[] = [];
  readonly createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  readonly parentSessionId?: string;
  readonly forkedFromMessageIndex?: number;
  messages: MessageChunk[];

  private readonly adapter: AcpClientAdapter;
  private readonly eventListeners = new Set<(event: SessionEvent) => void>();
  private readonly allowedToolsInSession = new Set<string>();

  public getAdapter(): AcpClientAdapter | undefined {
    return this.attached ? this.adapter : undefined;
  }

  public truncateTo(upToMessageIndex: number): void {
    const kept = upToMessageIndex < 0 ? [] : this.messages.slice(0, upToMessageIndex + 1);
    this.messages = kept;
    this.initialContext = this.initialContext ? kept.map((message) => structuredClone(message)) : undefined;
    this.runtimeRevision += 1;
    this.updatedAt = Date.now();
  }

  private approval?: PendingApproval & { resolve: (val: any) => void };
  private initialContext?: MessageChunk[];

  public get pendingApproval(): PendingApproval | undefined {
    if (!this.approval) return undefined;
    const { requestId, toolTitle, toolName, toolKind, toolCallId, toolInput, toolContent, toolLocations, options } = this.approval;
    return {
      sessionId: this.id,
      requestId,
      toolTitle,
      ...(toolName !== undefined ? { toolName } : {}),
      ...(toolKind !== undefined ? { toolKind } : {}),
      ...(toolCallId !== undefined ? { toolCallId } : {}),
      ...(toolInput !== undefined ? { toolInput } : {}),
      ...(toolContent !== undefined ? { toolContent } : {}),
      ...(toolLocations !== undefined ? { toolLocations } : {}),
      options: options.map((option) => ({ ...option })),
    };
  }

  private configPending = false;
  private configNotificationEpoch = 0;
  private promptInFlight = false;
  private currentPromptReject?: (err: any) => void;
  private readonly pendingOperations = new Set<(error: Error) => void>();

  private async runOperation<T>(work: Promise<T>): Promise<T> {
    let reject!: (error: Error) => void;
    const cancelled = new Promise<never>((_, callback) => {
      reject = callback;
      this.pendingOperations.add(callback);
    });
    try { return await deadline(Promise.race([work, cancelled]), QUICK_OPERATION_MS); }
    finally { this.pendingOperations.delete(reject); }
  }

  private rejectOperations(reason: string): void {
    for (const reject of this.pendingOperations) reject(new SessionError(this.id, reason));
    this.pendingOperations.clear();
  }
  private updateSubscription?: Disposable;
  private closeSubscription?: Disposable;

  constructor(options: SessionOptions) {
    this.id = options.id;
    this.agentId = options.agentId;
    this.cwd = options.cwd;
    this._title = options.title || "New Session";
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel;
    this.availableModels = options.availableModels
      ? [...options.availableModels]
      : [];
    this.availableThinkingLevels = options.availableThinkingLevels
      ? [...options.availableThinkingLevels]
      : [];
    this.availableCommands = options.availableCommands
      ? [...options.availableCommands]
      : [];
    this.capabilities = options.capabilities;
    this.modes = parseModes(options.modes);
    this.currentModeId = options.currentModeId ?? parseCurrentModeId(options.modes);
    this.compactions = options.compactions ? [...options.compactions] : [];
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || this.createdAt;
    this.status = options.status || "idle";
    this.messages = options.messages
      ? JSON.parse(JSON.stringify(options.messages))
      : [];
    this.parentSessionId = options.parentSessionId;
    this.forkedFromMessageIndex = options.forkedFromMessageIndex;
    this.adapter = options.adapter;
    this.runtimeRevision = options.runtimeRevision ?? 1;
    this.attached = options.attached ?? true;
    if (options.configOptions) this.applyConfigOptions(options.configOptions);
    else { this.modelConfigId = options.modelConfigId; this.thinkingConfigId = options.thinkingConfigId; }
    this.initialContext = options.initialContext
      ? JSON.parse(JSON.stringify(options.initialContext))
      : undefined;

    this.closeSubscription = this.adapter.onClose?.(() =>
      this.handleProcessCrash("Agent transport disconnected"),
    );
    // Subscribe to adapter session updates
    this.updateSubscription = this.adapter.onSessionUpdate(
      (event: SessionUpdateEvent) => {
        if (this.attached && event.sessionId === this.id) {
          this.handleSessionUpdate(event.update);
        }
      },
    );
  }

  public attachAdapter(adapter: AcpClientAdapter): void {
    this.runtimeRevision++;
    this.attached = true;
    this.model = undefined;
    this.thinkingLevel = undefined;
    this.modelConfigId = undefined;
    this.thinkingConfigId = undefined;
    this.availableModels = [];
    this.availableThinkingLevels = [];
    if (this.updateSubscription) {
      this.updateSubscription.dispose();
    }
    this.closeSubscription?.dispose();
    (this as any).adapter = adapter;
    this.closeSubscription = adapter.onClose?.(() =>
      this.handleProcessCrash("Agent transport disconnected"),
    );
    this.updateSubscription = adapter.onSessionUpdate(
      (event: SessionUpdateEvent) => {
        if (this.attached && event.sessionId === this.id) {
          this.handleSessionUpdate(event.update);
        }
      },
    );
    if (this.status === "error") {
      this.status = "idle";
    }
  }

  public replaceConfigOptions(options: any[]): void {
    this.applyConfigOptions(options);
  }

  private applyConfigOptions(options: any[]): void {
    const parsed: ParsedConfigOptions = parseConfigOptions(options);
    this.modelConfigId = parsed.modelConfigId;
    this.thinkingConfigId = parsed.thinkingConfigId;
    this.model = parsed.currentModel;
    this.thinkingLevel = parsed.currentThinkingLevel;
    this.availableModels = parsed.models ?? [];
    this.availableThinkingLevels = parsed.thinkingLevels ?? [];
    this.updatedAt = Date.now();
    this.emitEvent({ type: "config_option_update", sessionId: this.id, payload: this.serialize() });
  }

  public async setMode(modeId: string): Promise<void> {
    if (this.currentModeId === modeId) return;
    await this.adapter.setSessionMode(this.id, modeId);
    this.currentModeId = modeId;
    this.emitEvent({
      type: "mode_change",
      sessionId: this.id,
      payload: { currentModeId: this.currentModeId },
    });
  }

  public async setConfigOption(configId: string, value: string): Promise<void> {
    if (!this.attached) throw new SessionError(this.id, "Session is detached");
    if (this.configPending) throw new SessionError(this.id, "Configuration change already pending");
    const actualConfigId = configId === "model" ? this.modelConfigId ?? configId
      : ["thinkingLevel", "thought_level", "thinking_level"].includes(configId)
        ? this.thinkingConfigId ?? "thought_level" : configId;
    const revision = this.runtimeRevision;
    const notificationEpoch = this.configNotificationEpoch;
    this.configPending = true;
    try {
      const response = await this.runOperation(this.adapter.setConfigOption(this.id, actualConfigId, value));
      if (!this.attached || this.runtimeRevision !== revision) throw new SessionError(this.id, "Session is detached");
      if (Array.isArray(response?.configOptions) && notificationEpoch === this.configNotificationEpoch) this.applyConfigOptions(response.configOptions);
    } finally {
      this.configPending = false;
    }
  }

  public async prompt(
    text: string | ContentBlock[],
    options?: PromptOptions,
  ): Promise<void> {
    if (!this.attached) throw new SessionError(this.id, 'Session is detached');
    const revision = this.runtimeRevision;
    if (
      this.promptInFlight ||
      (this.status !== "idle" && this.status !== "error")
    ) {
      throw new SessionError(
        this.id,
        `Cannot prompt while session is in status: ${this.status}`,
      );
    }

    if (this.configPending) throw new SessionError(this.id, "Configuration change pending");
    this.promptInFlight = true;
    try {
      // If options specify model or thinkingLevel differing from session, sync first
      if (options?.model && options.model !== this.model && (this.availableModels.length === 0 || this.availableModels.includes(options.model))) {
        await this.setConfigOption("model", options.model);
      }
      if (
        options?.thinkingLevel &&
        options.thinkingLevel !== this.thinkingLevel &&
        (this.availableThinkingLevels.length === 0 || this.availableThinkingLevels.includes(options.thinkingLevel))
      ) {
        await this.setConfigOption("thought_level", options.thinkingLevel);
      }

      if (!this.attached || this.runtimeRevision !== revision) throw new SessionError(this.id, 'Session is detached');
      this.setStatus("streaming");
      this.messages = [...this.messages];

      if (
        this._title === "New Session" ||
        !this._title ||
        this._title === "Untitled Session"
      ) {
        const promptText =
          typeof text === "string"
            ? text
            : text
                .map((b) => (b.type === "text" ? b.text : ""))
                .join(" ");
        const trimmedPrompt = promptText.trim();
        if (trimmedPrompt) {
          const firstLine = trimmedPrompt
            .split(/\r?\n/)[0]
            .replace(/^[#*`\-\s]+/, "")
            .trim();
          const candidate = firstLine || trimmedPrompt.slice(0, 50);
          const derivedTitle =
            candidate.length > 50
              ? `${candidate.slice(0, 47)}...`
              : candidate;
          if (derivedTitle) {
            this.setTitle(derivedTitle);
          }
        }
      }

      // Append user message
      this.messages.push({
        role: "user",
        content: text,
      });

      // Append assistant placeholder
      const assistantMessage: MessageChunk = {
        role: "assistant",
        content: "",
        thinking: "",
        toolCalls: [],
        turns: [],
        startedAt: Date.now(),
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
            .prompt(
              this.id,
              this.initialContext?.length
                ? [
                    {
                      type: "text",
                      text: `Conversation context from the parent session:\n${JSON.stringify(this.initialContext)}`,
                    },
                    ...(typeof text === "string"
                      ? [{ type: "text" as const, text }]
                      : text),
                  ]
                : text,
              meta,
            )
            .then(() => {
              if (this.currentPromptReject === reject) this.currentPromptReject = undefined;
              resolve();
            })
            .catch((err) => {
              if (this.currentPromptReject === reject) this.currentPromptReject = undefined;
              reject(err);
            });
        });

        if (!this.attached || this.runtimeRevision !== revision) throw new SessionError(this.id, 'Session is detached');
        this.initialContext = undefined;
        this.messages = JSON.parse(JSON.stringify(this.messages));
        this.finishThinking(this.messages[this.messages.length - 1] ?? assistantMessage);
        this.setStatus("idle");
        this.updatedAt = Date.now();

      } catch (err: any) {
        if (!this.attached || this.runtimeRevision !== revision) throw err;
        if (err instanceof SessionError && err.message.includes("Prompt cancelled")) {
          this.finishThinking(assistantMessage);
          this.setStatus("idle");
          this.updatedAt = Date.now();
          return;
        }
        this.messages = JSON.parse(JSON.stringify(this.messages));
        const errMsg = err?.message || String(err);
        if ((this.status as SessionStatus) !== "error") {
          this.setStatus("error");
        }
        this.finishThinking(assistantMessage);
        // Record system error message in session history so it displays in chat!
        this.messages.push({
          role: "system",
          content: `Error: ${errMsg}`,
        });
        this.updatedAt = Date.now();

        throw err;
      }
    } finally {
      this.promptInFlight = false;
    }
  }

  public async cancel(): Promise<void> {
    const revision = this.runtimeRevision;
    if (this.status === "streaming" || this.status === "waiting_approval") {
      this.settleApproval();
      const rejectPrompt = this.currentPromptReject;
      this.currentPromptReject = undefined;
      try {
        await this.adapter.cancel(this.id);
      } catch {
        // ignore
      }
      if (rejectPrompt) {
        rejectPrompt(new SessionError(this.id, "Prompt cancelled"));
      } else if (this.attached && this.runtimeRevision === revision) {
        this.setStatus("idle");
      }
    }
  }

  public requestApproval(
    requestId: string,
    toolTitle: string,
    options: any[],
    detail?: ToolApprovalDetail,
  ): Promise<any> {
    if (!this.attached) return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const allowKey = detail?.toolName;
    if (allowKey && this.allowedToolsInSession.has(allowKey)) {
      const allowOnce = options.find((option) => {
        const kind = option?.kind;
        return kind === "allow_once" || (isAllowOptionKind(kind) && !isAlwaysAllowOptionKind(kind));
      });
      const allowOpt = allowOnce ?? options.find((option) => isAllowOptionKind(option?.kind));
      if (allowOpt)
        return Promise.resolve({
          outcome: { outcome: "selected", optionId: allowOpt.optionId },
        });
    }

    if (this.approval)
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
    return new Promise((resolve) => {
      this.approval = {
        requestId,
        toolTitle,
        ...(detail?.toolName !== undefined ? { toolName: detail.toolName } : {}),
        ...(detail?.toolKind !== undefined ? { toolKind: detail.toolKind } : {}),
        ...(detail?.toolCallId !== undefined ? { toolCallId: detail.toolCallId } : {}),
        ...(detail?.toolInput !== undefined ? { toolInput: detail.toolInput } : {}),
        ...(detail?.toolContent !== undefined ? { toolContent: detail.toolContent } : {}),
        ...(detail?.toolLocations !== undefined ? { toolLocations: detail.toolLocations } : {}),
        options: options.map((opt: any) => {
          const optionId = String(opt.optionId || opt.option_id || opt.id || "option");
          const name = String(opt.name || opt.title || "Option");
          let kind = opt.kind;
          if (!kind) {
            const lowerId = optionId.toLowerCase();
            const lowerName = name.toLowerCase();
            if (lowerId.includes("always") || lowerName.includes("always")) {
              kind = "allow_always";
            } else if (
              lowerId.includes("reject") ||
              lowerId.includes("deny") ||
              lowerName.includes("deny") ||
              lowerName.includes("reject")
            ) {
              kind = "reject_once";
            } else {
              kind = "allow_once";
            }
          }
          return { optionId, name, kind };
        }),
        resolve,
      };
      this.setStatus("waiting_approval");
      this.emitEvent({
        type: "permission_request",
        sessionId: this.id,
        payload: this.pendingApproval,
      });
    });
  }

  public async respondPermission(
    requestId: string,
    decision: "allow" | "deny" | "always_allow_session",
    options?: any,
  ): Promise<void> {
    if (this.status !== "waiting_approval") {
      throw new SessionError(
        this.id,
        "Cannot respond to permission when not in waiting_approval state",
      );
    }

    if (!this.approval || this.approval.requestId !== requestId) {
      throw new SessionError(
        this.id,
        `No pending approval request found for id: ${requestId}`,
      );
    }

    const { resolve, toolName, options: offered } = this.approval;
    const isAllow = decision === "allow" || decision === "always_allow_session";
    const selected =
      options?.optionId !== undefined
        ? offered.find((option) => option.optionId === options.optionId)
        : (offered.find((option) =>
            decision === "always_allow_session"
              ? isAlwaysAllowOptionKind(option.kind)
              : isAllowOptionKind(option.kind),
          ) ?? (offered.length === 1 ? offered[0] : undefined));
    if (
      (options?.optionId !== undefined &&
        (!selected || (decision === "deny" && !isRejectOptionKind(selected.kind)))) ||
      (isAllow && (!selected || !isAllowOptionKind(selected.kind))) ||
      (decision === "always_allow_session" && !isAlwaysAllowOptionKind(selected?.kind))
    ) {
      throw new SessionError(this.id, "Invalid permission option");
    }
    this.approval = undefined;

    if (decision === "always_allow_session" && toolName) {
      this.allowedToolsInSession.add(toolName);
    }

    this.setStatus("streaming");

    resolve({
      outcome:
        isAllow || options?.optionId !== undefined
          ? { outcome: "selected", optionId: selected!.optionId }
          : {
              outcome: "cancelled",
              ...(options?.reason ? { reason: options.reason } : {}),
            },
    });
  }

  public handleProcessCrash(reason: string): void {
    this.detach(reason);
  }

  public detach(reason: string): void {
    this.rejectOperations(reason);
    this.attached = false;
    this.runtimeRevision++;
    this.updateSubscription?.dispose();
    this.closeSubscription?.dispose();
    this.setStatus("error");

    this.emitEvent({
      type: "error",
      sessionId: this.id,
      payload: { message: reason },
    });

    this.settleApproval();

    if (this.currentPromptReject) {
      this.currentPromptReject(
        new SessionError(this.id, `Process crashed: ${reason}`),
      );
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
        runtimeRevision: this.runtimeRevision,
        attached: this.attached,
        title: this.title,
        cwd: this.cwd,
        model: this.model,
        thinkingLevel: this.thinkingLevel,
        modelConfigId: this.modelConfigId,
        thinkingConfigId: this.thinkingConfigId,
        availableModels: this.availableModels,
        availableThinkingLevels: this.availableThinkingLevels,
        availableCommands: this.availableCommands,
        capabilities: this.capabilities ?? this.adapter?.getAgentCapabilities?.(),
        modes: this.modes,
        currentModeId: this.currentModeId,
        compactions: this.compactions,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        status: this.status,
        messages: this.messages,
        initialContext: this.initialContext,
        parentSessionId: this.parentSessionId,
        forkedFromMessageIndex: this.forkedFromMessageIndex,
      }),
    );
  }

  private settleApproval(): void {
    const approval = this.approval;
    this.approval = undefined;
    approval?.resolve({ outcome: { outcome: "cancelled" } });
  }

  public dispose(): void {
    this.rejectOperations('Session disposed');
    this.attached = false;
    this.runtimeRevision++;
    this.settleApproval();
    this.currentPromptReject?.(new SessionError(this.id, "Session disposed"));
    this.currentPromptReject = undefined;
    this.updateSubscription?.dispose();
    this.closeSubscription?.dispose();
    this.eventListeners.clear();
  }

  private setStatus(newStatus: SessionStatus): void {
    // A permission request is valid only while the session is waiting for approval.
    // Settle it before publishing any transition out of that state.
    if (newStatus !== "waiting_approval" && this.approval) {
      this.settleApproval();
    }
    this.status = newStatus;
    this.emitEvent({
      type: "status_change",
      sessionId: this.id,
      payload: { status: newStatus },
    });
  }

  private finishThinking(message: MessageChunk, at: number = Date.now()): void {
    if (message.role !== "assistant" || message.completedAt !== undefined)
      return;
    message.completedAt = at;
    const turns = message.turns ?? [];
    if (turns.length > 0) {
      message.turns = [
        ...turns.slice(0, -1),
        { ...turns[turns.length - 1], completedAt: at },
      ];
    }
  }

  private handleSessionUpdate(update: any): void {
    const lastMsg = this.messages[this.messages.length - 1];

    switch (update.sessionUpdate) {
      case "current_mode_update": {
        if (typeof update.currentModeId === "string" && update.currentModeId) {
          this.currentModeId = update.currentModeId;
          this.emitEvent({
            type: "mode_change",
            sessionId: this.id,
            payload: { currentModeId: this.currentModeId },
          });
        }
        break;
      }
      case "config_option_update": {
        if (Array.isArray(update.configOptions)) {
          this.configNotificationEpoch++;
          this.applyConfigOptions(update.configOptions);
        }
        break;
      }
      case "session_info_update":
      case "title_update":
      case "session_info": {
        if (typeof update.title === "string" && update.title.trim()) {
          this.setTitle(update.title.trim());
        }
        if (update.updatedAt) {
          const ts =
            typeof update.updatedAt === "number"
              ? update.updatedAt
              : Date.parse(update.updatedAt);
          if (!Number.isNaN(ts) && ts > 0) {
            this.updatedAt = ts;
          }
        }
        break;
      }
      case "user_message_chunk": {
        if (this.promptInFlight) break;
        const text =
          (typeof update.content === "string"
            ? update.content
            : update.content?.text) ||
          update.text ||
          "";
        if (lastMsg && lastMsg.role === "user") {
          if (typeof lastMsg.content === "string") {
            lastMsg.content += text;
          }
        } else {
          this.messages.push({
            role: "user",
            content: text,
          });
        }
        if (
          (this._title === "New Session" || !this._title || this._title === "Untitled Session") &&
          text.trim()
        ) {
          const firstLine = text.trim().split(/\r?\n/)[0].replace(/^[#*`\-\s]+/, "").trim();
          const candidate = firstLine || text.trim().slice(0, 50);
          const derivedTitle = candidate.length > 50 ? `${candidate.slice(0, 47)}...` : candidate;
          if (derivedTitle) {
            this.setTitle(derivedTitle);
          }
        }
        break;
      }
      case "agent_thought_chunk": {
        const text =
          (typeof update.content === "string"
            ? update.content
            : update.content?.text) ||
          update.text ||
          update.thinking ||
          "";
        let targetMsg = lastMsg;
        if (!targetMsg || targetMsg.role !== "assistant") {
          targetMsg = {
            role: "assistant",
            content: "",
            thinking: "",
            toolCalls: [],
            startedAt: Date.now(),
          };
          this.messages.push(targetMsg);
        }
        const turns = targetMsg.turns ?? [];
        const currentTurn = turns[turns.length - 1];
        const now = Date.now();
        targetMsg.turns =
          !currentTurn || currentTurn.toolCalls.length > 0
            ? [
                ...turns.slice(0, -1),
                ...(currentTurn ? [{ ...currentTurn, completedAt: now }] : []),
                { thinking: text, toolCalls: [], startedAt: now },
              ]
            : [
                ...turns.slice(0, -1),
                {
                  ...currentTurn,
                  thinking: (currentTurn.thinking ?? "") + text,
                },
              ];
        targetMsg.thinking = (targetMsg.thinking || "") + text;
        this.emitEvent({
          type: "thinking",
          sessionId: this.id,
          payload: {
            thinking: text,
            text,
            content: text,
            turnIndex: targetMsg.turns.length,
            startedAt: targetMsg.turns[targetMsg.turns.length - 1].startedAt,
            previousTurnCompletedAt: currentTurn?.toolCalls.length
              ? now
              : undefined,
            messageStartedAt: targetMsg.startedAt,
            update,
          },
        });
        break;
      }
      case "agent_message_chunk": {
        const text =
          (typeof update.content === "string"
            ? update.content
            : update.content?.text) ||
          update.text ||
          "";
        let targetMsg = lastMsg;
        if (!targetMsg || targetMsg.role !== "assistant") {
          targetMsg = {
            role: "assistant",
            content: "",
            thinking: "",
            toolCalls: [],
            startedAt: Date.now(),
          };
          this.messages.push(targetMsg);
        }
        if (typeof targetMsg.content === "string") {
          targetMsg.content += text;
        }
        this.finishThinking(targetMsg);
        this.emitEvent({
          type: "chunk",
          sessionId: this.id,
          payload: { content: text, text, update },
        });
        break;
      }
      case "tool_call": {
        let targetMsg = lastMsg;
        if (!targetMsg || targetMsg.role !== "assistant") {
          targetMsg = {
            role: "assistant",
            content: "",
            thinking: "",
            toolCalls: [],
            startedAt: Date.now(),
          };
          this.messages.push(targetMsg);
        }
        const toolCall: ToolCall = {
          id: update.toolCallId || update.id,
          name: update.name || update.title || "tool",
          input:
            update.rawInput ??
            update.input ??
            update.raw_input ??
            update.arguments,
          output:
            update.rawOutput ??
            update.output ??
            update.result ??
            update.content,
          status:
            update.status === "in_progress"
              ? "running"
              : update.status || "pending",
          startedAt: Date.now(),
          ...(["completed", "failed", "denied"].includes(update.status)
            ? { completedAt: Date.now() }
            : {}),
        };
        const turns = targetMsg.turns ?? [];
        const currentTurn = turns[turns.length - 1];
        targetMsg.turns = currentTurn
          ? [
              ...turns.slice(0, -1),
              {
                ...currentTurn,
                toolCalls: [...currentTurn.toolCalls, toolCall],
              },
            ]
          : [{ toolCalls: [toolCall], startedAt: toolCall.startedAt }];
        targetMsg.toolCalls = [...(targetMsg.toolCalls ?? []), toolCall];
        this.emitEvent({
          type: "tool_call",
          sessionId: this.id,
          payload: {
            ...toolCall,
            turnIndex: targetMsg.turns.length,
            messageStartedAt: targetMsg.startedAt,
          },
        });
        break;
      }
      case "tool_call_update": {
        const id = update.toolCallId || update.id;
        const previousTool = lastMsg?.toolCalls?.find((tool) => tool.id === id);
        const status =
          update.status === "in_progress"
            ? "running"
            : (update.status ?? previousTool?.status ?? "running");
        const output =
          update.rawOutput ?? update.output ?? update.result ?? update.content;
        const input =
          update.rawInput ??
          update.input ??
          update.raw_input ??
          update.arguments;
        const completedAt = ["completed", "failed", "denied"].includes(status)
          ? (previousTool?.completedAt ?? Date.now())
          : undefined;
        if (lastMsg && lastMsg.role === "assistant") {
          const updateTool = (tool: ToolCall): ToolCall =>
            tool.id === id
              ? {
                  ...tool,
                  status,
                  ...(update.name ? { name: update.name } : {}),
                  ...(input !== undefined ? { input } : {}),
                  ...(output !== undefined ? { output } : {}),
                  ...(completedAt !== undefined ? { completedAt } : {}),
                }
              : tool;
          lastMsg.toolCalls = lastMsg.toolCalls?.map(updateTool);
          lastMsg.turns = lastMsg.turns?.map((turn) => ({
            ...turn,
            toolCalls: turn.toolCalls.map(updateTool),
          }));
        }
        this.emitEvent({
          type: "tool_result",
          sessionId: this.id,
          payload: {
            id,
            status,
            input,
            output,
            name: update.name,
            completedAt,
            update,
          },
        });
        break;
      }
      case "available_commands_update": {
        const rawCommands = update.availableCommands || update.available_commands;
        if (Array.isArray(rawCommands)) {
          this.availableCommands = rawCommands
            .map((cmd: any) => ({
              name: String(cmd.name || ""),
              description: String(cmd.description || ""),
              ...(cmd.input ? { input: cmd.input } : {}),
            }))
            .filter((c) => c.name.length > 0);
          this.emitEvent({
            type: "available_commands_update",
            sessionId: this.id,
            payload: { availableCommands: this.availableCommands },
          });

        }
        break;
      }
      case "compaction_update": {
        const id = update.compactionId || update.id || `cmp-${Date.now()}`;
        let entry = this.compactions.find((c) => c.compactionId === id);
        const parseSummary = (s: any) =>
          typeof s === "string"
            ? s
            : Array.isArray(s)
            ? s.map((item: any) => item.text || (typeof item === "string" ? item : "")).join("\n")
            : undefined;

        if (!entry) {
          entry = {
            compactionId: id,
            status: update.status || "in_progress",
            summary: parseSummary(update.summary),
            error: update.error,
            startedAt: Date.now(),
          };
          this.compactions.push(entry);
        } else {
          entry.status = update.status ?? entry.status;
          if (update.error) entry.error = update.error;
          if (update.summary !== undefined) {
            entry.summary = parseSummary(update.summary);
          }
        }
        if (["completed", "failed", "cancelled"].includes(entry.status)) {
          entry.completedAt = Date.now();
        }
        this.emitEvent({
          type: "compaction",
          sessionId: this.id,
          payload: {
            ...entry,
            update,
          },
        });

        break;
      }
      case "compaction_summary_chunk": {
        const id = update.compactionId || update.id;
        let entry = this.compactions.find((c) => c.compactionId === id);
        if (!entry) {
          entry = {
            compactionId: id,
            status: "in_progress",
            summary: "",
            startedAt: Date.now(),
          };
          this.compactions.push(entry);
        }
        const textChunk =
          typeof update.content === "string"
            ? update.content
            : update.content?.text || "";
        entry.summary = (entry.summary || "") + textChunk;
        this.emitEvent({
          type: "compaction_chunk",
          sessionId: this.id,
          payload: {
            compactionId: id,
            text: textChunk,
            summary: entry.summary,
            update,
          },
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
        listener({ ...event, agentId: this.agentId, runtimeRevision: this.runtimeRevision });
      } catch (err) {
        console.error(`[Session ${this.id}] error in event listener:`, err);
      }
    }
  }
}
