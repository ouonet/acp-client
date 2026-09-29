import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough, Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { AcpClientAdapter } from '../../src/core/protocol/acp-client-adapter';
import type { ContentBlock } from '../../src/core/types/session';

describe('T5: AcpClientAdapter (ACP SDK Transport & Protocol Negotiation)', () => {
  let clientToAgent: PassThrough;
  let agentToClient: PassThrough;
  let adapter: AcpClientAdapter;
  let agentConnection: any;

  beforeEach(() => {
    clientToAgent = new PassThrough();
    agentToClient = new PassThrough();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close().catch(() => {});
    }
    if (agentConnection) {
      try {
        agentConnection.close();
      } catch {
        // ignore
      }
    }
  });

  function setupMockAgent(handlers?: {
    onInitialize?: (params: any) => any;
    onNewSession?: (params: any) => any;
    onPrompt?: (params: any, client: any) => Promise<any>;
    onCancel?: (params: any) => void;
  }) {
    const agentIn = Readable.toWeb(clientToAgent) as ReadableStream<Uint8Array>;
    const agentOut = Writable.toWeb(agentToClient) as WritableStream<Uint8Array>;
    const stream = acp.ndJsonStream(agentOut, agentIn);

    const app = acp.agent({ name: 'mock-agent' })
      .onRequest(acp.methods.agent.initialize, (ctx) => {
        if (handlers?.onInitialize) return handlers.onInitialize(ctx.params);
        return {
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: true,
            promptCapabilities: {
              image: true,
              audio: true,
            },
          },
        };
      })
      .onRequest(acp.methods.agent.session.new, (ctx) => {
        if (handlers?.onNewSession) return handlers.onNewSession(ctx.params);
        return { sessionId: 'test-session-1' };
      })
      .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
        if (handlers?.onPrompt) return handlers.onPrompt(ctx.params, ctx.client);
        await ctx.client.notify(acp.methods.client.session.update, {
          sessionId: ctx.params.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Hello from mock agent' },
          },
        });
        return { stopReason: 'end_turn' };
      })
      .onNotification(acp.methods.agent.session.cancel, (ctx) => {
        handlers?.onCancel?.(ctx.params);
      });

    agentConnection = app.connect(stream);
  }

  it('should complete initialize handshake and negotiate protocol version and capabilities', async () => {
    setupMockAgent();

    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
      clientInfo: { name: 'test-client', version: '0.1.0' },
    });

    const initResult = await adapter.initialize();

    expect(initResult.protocolVersion).toBe(1);
    expect(initResult.agentCapabilities?.loadSession).toBe(true);
    expect(adapter.getProtocolVersion()).toBe(1);
    expect(adapter.isConnected()).toBe(true);
  });

  it('should create new session and pass cwd and mcp servers', async () => {
    let receivedNewSessionParams: any = null;
    setupMockAgent({
      onNewSession: (params) => {
        receivedNewSessionParams = params;
        return { sessionId: 'custom-session-99' };
      },
    });

    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
    });

    const mcpServers = [
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: [],
      },
    ];
    await adapter.initialize();
    const result = await adapter.newSession('/path/to/project', mcpServers);

    expect(result.sessionId).toBe('custom-session-99');
    expect(receivedNewSessionParams.cwd).toBe('/path/to/project');
    expect(receivedNewSessionParams.mcpServers).toHaveLength(1);
  });

  it('should send prompt, receive streamed updates, and resolve on turn completion', async () => {
    setupMockAgent({
      onPrompt: async (params, client) => {
        // Stream thinking chunk
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'Thinking about the answer...' },
          },
        });
        // Stream message chunk
        await client.notify(acp.methods.client.session.update, {
          sessionId: params.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Here is your answer!' },
          },
        });
        return { stopReason: 'end_turn' };
      },
    });

    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
    });

    await adapter.initialize();
    const { sessionId } = await adapter.newSession('/tmp');

    const updates: any[] = [];
    adapter.onSessionUpdate((e) => {
      if (e.sessionId === sessionId) {
        updates.push(e.update);
      }
    });

    const promptResult = await adapter.prompt(sessionId, 'What is the answer?');

    expect(promptResult.stopReason).toBe('end_turn');
    expect(updates).toHaveLength(2);
    expect(updates[0].sessionUpdate).toBe('agent_thought_chunk');
    expect(updates[1].sessionUpdate).toBe('agent_message_chunk');
  });

  it('should support multimodal content blocks in prompt', async () => {
    let receivedPrompt: any = null;
    setupMockAgent({
      onPrompt: async (params) => {
        receivedPrompt = params.prompt;
        return { stopReason: 'end_turn' };
      },
    });

    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
    });

    await adapter.initialize();
    const { sessionId } = await adapter.newSession('/tmp');

    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Inspect this diagram' },
      { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
    ];

    await adapter.prompt(sessionId, blocks);

    expect(receivedPrompt).toHaveLength(2);
    expect(receivedPrompt[0]).toEqual({ type: 'text', text: 'Inspect this diagram' });
    expect(receivedPrompt[1].type).toBe('image');
  });

  it('should handle permission requests from agent and return client decision', async () => {
    setupMockAgent({
      onPrompt: async (params, client) => {
        const permRes = await client.request(acp.methods.client.session.requestPermission, {
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: 'call-1',
          },
          options: [
            { optionId: 'opt-allow', name: 'Allow', kind: 'allow_once' },
            { optionId: 'opt-deny', name: 'Deny', kind: 'reject_once' },
          ],
        });

        if (permRes.outcome.outcome === 'selected' && permRes.outcome.optionId === 'opt-allow') {
          return { stopReason: 'end_turn' };
        }
        return { stopReason: 'cancelled' };
      },
    });

    let permissionRequested = false;
    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
      onRequestPermission: async (req) => {
        permissionRequested = true;
        expect(req.toolCall.toolCallId).toBe('call-1');
        return {
          outcome: {
            outcome: 'selected',
            optionId: 'opt-allow',
          },
        };
      },
    });

    await adapter.initialize();
    const { sessionId } = await adapter.newSession('/tmp');
    const result = await adapter.prompt(sessionId, 'Delete temporary files');

    expect(permissionRequested).toBe(true);
    expect(result.stopReason).toBe('end_turn');
  });

  it('should handle fs requests from agent and route to workspace handlers', async () => {
    setupMockAgent({
      onPrompt: async (params, client) => {
        const readRes = await client.request(acp.methods.client.fs.readTextFile, {
          sessionId: params.sessionId,
          path: '/src/main.ts',
        });
        await client.request(acp.methods.client.fs.writeTextFile, {
          sessionId: params.sessionId,
          path: '/src/output.txt',
          content: `processed: ${readRes.content}`,
        });
        return { stopReason: 'end_turn' };
      },
    });

    const writtenFiles = new Map<string, string>();
    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
      onReadTextFile: async (path) => {
        if (path === '/src/main.ts') return 'export const x = 1;';
        throw new Error('File not found');
      },
      onWriteTextFile: async (path, content) => {
        writtenFiles.set(path, content);
      },
    });

    await adapter.initialize();
    const { sessionId } = await adapter.newSession('/tmp');
    await adapter.prompt(sessionId, 'Process main.ts');

    expect(writtenFiles.get('/src/output.txt')).toBe('processed: export const x = 1;');
  });

  it('should notify agent on prompt cancellation', async () => {
    let cancelReceived = false;
    setupMockAgent({
      onCancel: (params) => {
        if (params.sessionId === 'test-session-1') {
          cancelReceived = true;
        }
      },
    });

    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
    });

    await adapter.initialize();
    const { sessionId } = await adapter.newSession('/tmp');

    await adapter.cancel(sessionId);
    // Allow microtask tick for notification dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(cancelReceived).toBe(true);
  });

  it('should close connection cleanly and trigger onClose', async () => {
    setupMockAgent();

    adapter = new AcpClientAdapter({
      input: agentToClient,
      output: clientToAgent,
    });

    await adapter.initialize();

    let closeFired = false;
    adapter.onClose(() => {
      closeFired = true;
    });

    await adapter.close();

    expect(adapter.isConnected()).toBe(false);
    expect(closeFired).toBe(true);

    // Operations on closed adapter should throw
    await expect(adapter.newSession('/tmp')).rejects.toThrow();
  });
});
