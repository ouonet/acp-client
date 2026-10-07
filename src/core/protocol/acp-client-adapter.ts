import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { Disposable } from "../ports";
import { ProtocolError } from "../errors";
import type { ContentBlock, AvailableCommand } from "../types/session";

export interface AcpAdapterOptions {
  input: NodeJS.ReadableStream | ReadableStream<Uint8Array>;
  output: NodeJS.WritableStream | WritableStream<Uint8Array>;
  clientInfo?: {
    name: string;
    version: string;
  };
  preferredProtocolVersion?: 1 | 2;
  onRequestPermission?: (params: any) => Promise<any>;
  onReadTextFile?: (path: string) => Promise<string>;
  onWriteTextFile?: (path: string, content: string) => Promise<void>;
}

export interface SessionUpdateEvent {
  sessionId: string;
  update: any;
}

export interface ParsedConfigOptions {
  modelConfigId?: string;
  thinkingConfigId?: string;
  models?: string[];
  currentModel?: string;
  thinkingLevels?: string[];
  currentThinkingLevel?: string;
}

export interface LoadSessionResult {
  sessionId?: string;
  configOptions?: any[];
  models?: string[];
  currentModel?: string;
  thinkingLevels?: string[];
  currentThinkingLevel?: string;
  availableCommands?: AvailableCommand[];
  [key: string]: any;
}

export interface NewSessionResult {
  sessionId: string;
  modes?: any;
  configOptions?: any[];
  models?: string[];
  currentModel?: string;
  thinkingLevels?: string[];
  currentThinkingLevel?: string;
  availableCommands?: AvailableCommand[];
}

export class AcpClientAdapter {
  private readonly options: AcpAdapterOptions;
  private connection: acp.ClientConnection | null = null;
  private protocolVersion?: number;
  private agentCapabilities?: any;
  private agentInfo?: { name: string; title?: string; version?: string };
  private connected = false;

  private isClosed = false;

  private sessionUpdateListeners = new Set<
    (event: SessionUpdateEvent) => void
  >();
  private closeListeners = new Set<() => void>();

  constructor(options: AcpAdapterOptions) {
    this.options = options;
    this.initConnection();
  }

  private initConnection(): void {
    const webInput =
      typeof (this.options.input as any).getReader === "function"
        ? (this.options.input as ReadableStream<Uint8Array>)
        : (Readable.toWeb(
            this.options.input as unknown as Readable,
          ) as ReadableStream<Uint8Array>);

    const webOutput =
      typeof (this.options.output as any).getWriter === "function"
        ? (this.options.output as WritableStream<Uint8Array>)
        : (Writable.toWeb(
            this.options.output as unknown as Writable,
          ) as WritableStream<Uint8Array>);

    const stream = acp.ndJsonStream(webOutput, webInput);

    const clientApp = acp.client({
      name: this.options.clientInfo?.name || "vscode-acp-client",
    });

    // Register permission request handler
    clientApp.onRequest(
      acp.methods.client.session.requestPermission,
      async (ctx) => {
        if (this.options.onRequestPermission) {
          return this.options.onRequestPermission(ctx.params);
        }
        return {
          outcome: {
            outcome: "cancelled",
          },
        };
      },
    );

    // Register fs/readTextFile handler
    clientApp.onRequest(acp.methods.client.fs.readTextFile, async (ctx) => {
      if (this.options.onReadTextFile) {
        const content = await this.options.onReadTextFile(ctx.params.path);
        return { content };
      }
      throw new Error(`ReadTextFile not implemented: ${ctx.params.path}`);
    });

    // Register fs/writeTextFile handler
    clientApp.onRequest(acp.methods.client.fs.writeTextFile, async (ctx) => {
      if (this.options.onWriteTextFile) {
        await this.options.onWriteTextFile(ctx.params.path, ctx.params.content);
        return {};
      }
      throw new Error(`WriteTextFile not implemented: ${ctx.params.path}`);
    });

    // Register session/update notification listener
    clientApp.onNotification(acp.methods.client.session.update, (ctx) => {
      const event: SessionUpdateEvent = {
        sessionId: ctx.params.sessionId,
        update: ctx.params.update,
      };
      for (const listener of this.sessionUpdateListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(
            "[AcpClientAdapter] error in session update listener:",
            err,
          );
        }
      }
    });

    this.connection = clientApp.connect(stream);
    this.connected = true;

    this.connection.closed
      .then(() => {
        this.handleClosed();
      })
      .catch(() => {
        this.handleClosed();
      });
  }

  private handleClosed(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.connected = false;
    for (const listener of this.closeListeners) {
      try {
        listener();
      } catch (err) {
        console.error("[AcpClientAdapter] error in close listener:", err);
      }
    }
  }

  private clientCapabilities?: acp.ClientCapabilities;

  public getClientCapabilities(): acp.ClientCapabilities | undefined {
    return this.clientCapabilities && structuredClone(this.clientCapabilities);
  }

  public async initialize(
    capabilities?: any,
  ): Promise<{ protocolVersion: number; agentCapabilities?: any; agentInfo?: { name: string; title?: string; version?: string } }> {
    this.assertConnected();

    const versionToRequest = this.options.preferredProtocolVersion || 1;
    const clientCapabilities = {
      session: { compaction: {} },
      ...capabilities,
      fs: {
        readTextFile: !!this.options.onReadTextFile && capabilities?.fs?.readTextFile !== false,
        writeTextFile: !!this.options.onWriteTextFile && capabilities?.fs?.writeTextFile !== false,
      },
      // Offering terminal requires the complete ACP terminal lifecycle, not just command execution.
      terminal: false,
    };

    const initPromise = this.connection!.agent.request(
      acp.methods.agent.initialize,
      {
        protocolVersion: versionToRequest,
        clientCapabilities,
      },
    ) as Promise<{ protocolVersion: number; agentCapabilities?: any; agentInfo?: { name: string; title?: string; version?: string } }>;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{
      protocolVersion: number;
      agentCapabilities?: any;
    }>((_, reject) => {
      timeout = setTimeout(() => {
        reject(
          new Error(
            "ACP agent initialization timed out after 10000ms. The process started but did not complete the ACP JSON-RPC handshake. Check the Output panel for process logs.",
          ),
        );
      }, 10000);
    });

    let result: Awaited<typeof initPromise>;
    try { result = await Promise.race([initPromise, timeoutPromise]); }
    finally { if (timeout) clearTimeout(timeout); }
    this.assertConnected();
    this.protocolVersion = result.protocolVersion;
    this.agentCapabilities = result.agentCapabilities;
    this.agentInfo = result.agentInfo;
    this.clientCapabilities = structuredClone(clientCapabilities);

    return {
      protocolVersion: this.protocolVersion,
      agentCapabilities: this.agentCapabilities,
      agentInfo: this.agentInfo,
    };
  }

  public async newSession(
    cwd: string,
    mcpServers?: any[],
  ): Promise<NewSessionResult> {
    this.assertConnected();

    const response = (await this.connection!.agent.request(
      acp.methods.agent.session.new,
      {
        cwd,
        mcpServers: mcpServers || [],
      },
    )) as any;

    const sessionId = response.sessionId || response.session_id;
    const configOpts = response.configOptions || response.config_options;
    const modes = response.modes;
    const parsed = parseConfigOptions(configOpts);

    return {
      sessionId,
      modes,
      configOptions: configOpts,
      models: parsed.models,
      currentModel: parsed.currentModel,
      thinkingLevels: parsed.thinkingLevels,
      currentThinkingLevel: parsed.currentThinkingLevel,
      availableCommands: parseAvailableCommands(response),
    };
  }

  public async forkSession(
    sessionId: string,
    cwd: string,
    upToMessageIndex?: number,
  ): Promise<NewSessionResult | undefined> {
    this.assertConnected();
    if (!this.agentCapabilities?.sessionCapabilities?.fork)
      return undefined;
    const response = (await this.connection!.agent.request(
      acp.methods.agent.session.fork,
      {
        sessionId,
        cwd,
        mcpServers: [],
        ...(typeof upToMessageIndex === "number" ? { _meta: { upToMessageIndex } } : {}),
      },
    )) as any;
    const configOpts = response.configOptions || response.config_options;
    const parsed = parseConfigOptions(configOpts);
    return {
      sessionId: response.sessionId || response.session_id,
      modes: response.modes,
      configOptions: configOpts,
      models: parsed.models,
      currentModel: parsed.currentModel,
      thinkingLevels: parsed.thinkingLevels,
      currentThinkingLevel: parsed.currentThinkingLevel,
      availableCommands: parseAvailableCommands(response),
    };
  }

  public async rewindSession(sessionId: string, upToMessageIndex: number): Promise<void> {
    this.assertConnected();
    await this.connection!.agent.request("_aharness/session/rewind", { sessionId, upToMessageIndex });
  }

  public async prompt(
    sessionId: string,
    prompt: string | ContentBlock[],
    meta?: any,
  ): Promise<{ stopReason: string }> {
    this.assertConnected();

    const blocks: ContentBlock[] =
      typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;

    const payload: any = {
      sessionId,
      prompt: blocks,
    };

    if (meta) {
      payload._meta = meta;
    }

    const response = (await this.connection!.agent.request(
      acp.methods.agent.session.prompt,
      payload,
    )) as {
      stopReason: string;
    };
    return { stopReason: response.stopReason };
  }

  public async cancel(sessionId: string): Promise<void> {
    if (!this.connected || !this.connection) return;

    await this.connection.agent.notify(acp.methods.agent.session.cancel, {
      sessionId,
    });
  }

  public async listSessionPage(params: { cwd?: string; cursor?: string } = {}): Promise<{
    sessions: Array<{ sessionId: string; cwd?: string; title?: string; updatedAt?: string }>;
    nextCursor?: string;
  }> {
    this.assertConnected();
    if (!this.agentCapabilities?.sessionCapabilities?.list) {
      throw new ProtocolError(-32601, 'Agent does not support session/list');
    }
    const response = await this.connection!.agent.request(acp.methods.agent.session.list, params) as any;
    return {
      sessions: (Array.isArray(response?.sessions) ? response.sessions : []).map((s: any) => ({
        sessionId: s.sessionId || s.session_id,
        cwd: s.cwd || s.workspace_path,
        title: s.title,
        updatedAt: s.updatedAt || s.updated_at,
      })),
      nextCursor: response?.nextCursor ?? response?.next_cursor,
    };
  }

  public async listSessions(params: { cwd?: string; cursor?: string } = {}) {
    return (await this.listSessionPage(params)).sessions;
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    this.assertConnected();
    if (!this.agentCapabilities?.sessionCapabilities?.delete) {
      return false;
    }

    await this.connection!.agent.request(acp.methods.agent.session.delete, {
      sessionId,
    });
    return true;
  }

  public async loadSession(
    sessionId: string,
    cwd: string,
    mcpServers: any[] = [],
  ): Promise<LoadSessionResult> {
    this.assertConnected();

    const response = (await this.connection!.agent.request(
      acp.methods.agent.session.load,
      {
        sessionId,
        cwd,
        mcpServers,
      },
    )) as any;

    const configOpts = response?.configOptions || response?.config_options;
    const parsed = parseConfigOptions(configOpts);

    return {
      ...response,
      configOptions: configOpts,
      models: parsed.models,
      currentModel: parsed.currentModel,
      thinkingLevels: parsed.thinkingLevels,
      currentThinkingLevel: parsed.currentThinkingLevel,
      availableCommands: parseAvailableCommands(response),
    };
  }

  public async closeSession(sessionId: string): Promise<void> {
    if (!this.connected || !this.connection || !this.agentCapabilities?.sessionCapabilities?.close) return;
    await this.connection.agent.request(acp.methods.agent.session.close, { sessionId });
  }

  public async setConfigOption(
    sessionId: string,
    configId: string,
    value: string | boolean,
  ): Promise<any> {
    this.assertConnected();

    return this.connection!.agent.request(
      acp.methods.agent.session.setConfigOption,
      {
        sessionId,
        configId,
        value,
      },
    );
  }

  public onSessionUpdate(
    listener: (event: SessionUpdateEvent) => void,
  ): Disposable {
    this.sessionUpdateListeners.add(listener);
    return {
      dispose: () => {
        this.sessionUpdateListeners.delete(listener);
      },
    };
  }

  public onClose(listener: () => void): Disposable {
    this.closeListeners.add(listener);
    return {
      dispose: () => {
        this.closeListeners.delete(listener);
      },
    };
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getProtocolVersion(): number | undefined {
    return this.protocolVersion;
  }

  public getAgentInfo(): { name: string; title?: string; version?: string } | undefined {
    return this.agentInfo ? { ...this.agentInfo } : undefined;
  }

  public getAgentCapabilities(): any {
    return this.agentCapabilities;
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    try {
      this.connection?.close();
    } catch {
      // ignore
    }
    this.handleClosed();
  }

  private assertConnected(): void {
    if (!this.connected || !this.connection) {
      throw new ProtocolError(-32000, "ACP client is not connected");
    }
  }
}

export function extractSelectOptionValues(options: any[]): string[] {
  const result: string[] = [];
  if (!Array.isArray(options)) return result;

  for (const item of options) {
    if (!item) continue;
    if (typeof item === "string") {
      result.push(item);
    } else if (Array.isArray(item.options)) {
      // Grouped options
      for (const subItem of item.options) {
        if (typeof subItem === "string") {
          result.push(subItem);
        } else if (subItem?.value) {
          result.push(String(subItem.value));
        } else if (subItem?.name) {
          result.push(String(subItem.name));
        }
      }
    } else if (item.value) {
      result.push(String(item.value));
    } else if (item.name) {
      result.push(String(item.name));
    }
  }
  return result;
}

export function parseConfigOptions(configOpts: any[]): ParsedConfigOptions {
  const result: ParsedConfigOptions = {};
  if (!Array.isArray(configOpts)) return result;

  for (const opt of configOpts) {
    if (!opt) continue;
    const id = (opt.category || opt.id || opt.name || "").toLowerCase();
    const curVal = opt.currentValue ?? opt.current_value;

    if (id === "model" || id === "model_id" || id === "models") {
      result.modelConfigId = opt.id;
      if (Array.isArray(opt.options)) {
        result.models = extractSelectOptionValues(opt.options);
      }
      if (curVal !== undefined && curVal !== null) {
        result.currentModel = String(curVal);
      }
    }
    if (
      id === "thought_level" ||
      id === "thinking_level" ||
      id === "reasoning_level" ||
      id === "thinking"
    ) {
      result.thinkingConfigId = opt.id;
      if (Array.isArray(opt.options)) {
        result.thinkingLevels = extractSelectOptionValues(opt.options);
      }
      if (curVal !== undefined && curVal !== null) {
        result.currentThinkingLevel = String(curVal);
      }
    }
  }

  return result;
}

export function parseAvailableCommands(raw: any): AvailableCommand[] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const cmds = raw.availableCommands || raw.available_commands;
  if (!Array.isArray(cmds)) return undefined;
  return cmds
    .map((cmd: any) => ({
      name: String(cmd.name || ""),
      description: String(cmd.description || ""),
      ...(cmd.input ? { input: cmd.input } : {}),
    }))
    .filter((c) => c.name.length > 0);
}
