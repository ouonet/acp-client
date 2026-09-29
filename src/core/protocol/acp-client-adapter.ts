import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { Disposable } from '../ports';
import { ProtocolError } from '../errors';
import type { ContentBlock } from '../types/session';

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

export class AcpClientAdapter {
  private readonly options: AcpAdapterOptions;
  private connection: acp.ClientConnection | null = null;
  private protocolVersion?: number;
  private agentCapabilities?: any;
  private connected = false;

  private isClosed = false;

  private sessionUpdateListeners = new Set<(event: SessionUpdateEvent) => void>();
  private closeListeners = new Set<() => void>();

  constructor(options: AcpAdapterOptions) {
    this.options = options;
    this.initConnection();
  }

  private initConnection(): void {
    const webInput =
      typeof (this.options.input as any).getReader === 'function'
        ? (this.options.input as ReadableStream<Uint8Array>)
        : (Readable.toWeb(this.options.input as unknown as Readable) as ReadableStream<Uint8Array>);

    const webOutput =
      typeof (this.options.output as any).getWriter === 'function'
        ? (this.options.output as WritableStream<Uint8Array>)
        : (Writable.toWeb(this.options.output as unknown as Writable) as WritableStream<Uint8Array>);

    const stream = acp.ndJsonStream(webOutput, webInput);

    const clientApp = acp.client({
      name: this.options.clientInfo?.name || 'vscode-acp-client',
    });

    // Register permission request handler
    clientApp.onRequest(acp.methods.client.session.requestPermission, async (ctx) => {
      if (this.options.onRequestPermission) {
        return this.options.onRequestPermission(ctx.params);
      }
      return {
        outcome: {
          outcome: 'cancelled',
        },
      };
    });

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
          console.error('[AcpClientAdapter] error in session update listener:', err);
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
        console.error('[AcpClientAdapter] error in close listener:', err);
      }
    }
  }

  public async initialize(capabilities?: any): Promise<{ protocolVersion: number; agentCapabilities?: any }> {
    this.assertConnected();

    const versionToRequest = this.options.preferredProtocolVersion || 1;
    const clientCapabilities = {
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
      session: {
        loadSession: true,
      },
      ...capabilities,
    };

    const result = (await this.connection!.agent.request(acp.methods.agent.initialize, {
      protocolVersion: versionToRequest,
      clientCapabilities,
    })) as { protocolVersion: number; agentCapabilities?: any };

    this.protocolVersion = result.protocolVersion;
    this.agentCapabilities = result.agentCapabilities;

    return {
      protocolVersion: this.protocolVersion,
      agentCapabilities: this.agentCapabilities,
    };
  }

  public async newSession(cwd: string, mcpServers?: any[]): Promise<{ sessionId: string }> {
    this.assertConnected();

    const response = (await this.connection!.agent.request(acp.methods.agent.session.new, {
      cwd,
      mcpServers: mcpServers || [],
    })) as { sessionId: string };

    return { sessionId: response.sessionId };
  }

  public async prompt(
    sessionId: string,
    prompt: string | ContentBlock[],
    meta?: any,
  ): Promise<{ stopReason: string }> {
    this.assertConnected();

    const blocks: ContentBlock[] =
      typeof prompt === 'string'
        ? [{ type: 'text', text: prompt }]
        : prompt;

    const payload: any = {
      sessionId,
      prompt: blocks,
    };

    if (meta) {
      payload._meta = meta;
    }

    const response = (await this.connection!.agent.request(acp.methods.agent.session.prompt, payload)) as {
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

  public async loadSession(sessionId: string, cwd: string): Promise<any> {
    this.assertConnected();

    return this.connection!.agent.request(acp.methods.agent.session.load, {
      sessionId,
      cwd,
    });
  }

  public async closeSession(sessionId: string): Promise<void> {
    if (!this.connected || !this.connection) return;

    try {
      await this.connection.agent.request(acp.methods.agent.session.close, {
        sessionId,
      });
    } catch {
      // close may be optional on older agents
    }
  }

  public onSessionUpdate(listener: (event: SessionUpdateEvent) => void): Disposable {
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
      throw new ProtocolError(-32000, 'ACP client is not connected');
    }
  }
}
