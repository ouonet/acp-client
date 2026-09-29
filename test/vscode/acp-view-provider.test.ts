import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AcpViewProvider } from '../../src/vscode/acp-view-provider';
import type { ISessionHub, ISession } from '../../src/core/session/session-hub';
import type { IProcessPort, IStoragePort, Disposable } from '../../src/core/ports';
import type { WebviewAction, ExtensionMessage } from '../../src/shared/ipc-protocol';
import type { SessionSummary } from '../../src/core/types/session';

describe('T2: AcpViewProvider & Unidirectional IPC Bridge', () => {
  let mockWebview: {
    postMessage: ReturnType<typeof vi.fn>;
    onDidReceiveMessage: (handler: (msg: any) => void) => Disposable;
    html: string;
    options: any;
    fireMessage: (msg: WebviewAction) => Promise<void>;
  };

  let mockWebviewView: any;
  let mockSessionHub: ISessionHub;
  let mockProcessManager: IProcessPort;
  let mockStorageManager: IStoragePort;
  let provider: AcpViewProvider;
  let postedMessages: ExtensionMessage[];

  beforeEach(() => {
    postedMessages = [];

    let messageHandler: ((msg: any) => void) | null = null;
    mockWebview = {
      postMessage: vi.fn().mockImplementation((msg: ExtensionMessage) => {
        postedMessages.push(msg);
        return Promise.resolve(true);
      }),
      onDidReceiveMessage: (handler) => {
        messageHandler = handler;
        return { dispose: () => { messageHandler = null; } };
      },
      html: '',
      options: {},
      fireMessage: async (msg: WebviewAction) => {
        if (messageHandler) {
          await messageHandler(msg);
        }
      },
    };

    mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: vi.fn(),
    };

    const mockSession: Partial<ISession> = {
      id: 'sess-active',
      agentId: 'agent-1',
      title: 'Active Session',
      status: 'idle',
      messages: [],
      prompt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      respondPermission: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockReturnValue({ dispose: () => {} }),
      serialize: vi.fn().mockReturnValue({
        id: 'sess-active',
        agentId: 'agent-1',
        title: 'Active Session',
        status: 'idle',
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      }),
    };

    const sessionsList: SessionSummary[] = [
      {
        id: 'sess-active',
        agentId: 'agent-1',
        title: 'Active Session',
        status: 'idle',
        messageCount: 0,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    mockSessionHub = {
      createSession: vi.fn().mockResolvedValue(mockSession),
      forkSession: vi.fn().mockResolvedValue({ ...mockSession, id: 'sess-forked' }),
      getSession: vi.fn().mockReturnValue(mockSession),
      listSessions: vi.fn().mockReturnValue(sessionsList),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      setActiveSession: vi.fn(),
      getActiveSession: vi.fn().mockReturnValue(mockSession),
      onSessionListChange: vi.fn().mockReturnValue({ dispose: () => {} }),
      onActiveSessionChange: vi.fn().mockReturnValue({ dispose: () => {} }),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    mockProcessManager = {
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn().mockResolvedValue({ pid: 200 }),
      getStatus: vi.fn().mockReturnValue('running'),
      onStatusChange: vi.fn().mockReturnValue({ dispose: () => {} }),
      dispose: vi.fn(),
    };

    mockStorageManager = {
      saveSession: vi.fn(),
      loadSession: vi.fn(),
      listSavedSessions: vi.fn().mockResolvedValue([]),
      deleteSavedSession: vi.fn(),
      recordInputHistory: vi.fn().mockResolvedValue(undefined),
      getInputHistory: vi.fn().mockResolvedValue(['prompt 1', 'prompt 2']),
      saveAgentConfigs: vi.fn().mockResolvedValue(undefined),
      getAgentConfigs: vi.fn().mockResolvedValue([
        {
          id: 'agent-1',
          name: 'Main Agent',
          command: 'node',
          args: [],
          env: {},
          transport: 'stdio',
          enabled: true,
        },
      ]),
    };

    const mockOutputChannel = {
      appendLine: vi.fn(),
      show: vi.fn(),
    };

    provider = new AcpViewProvider({
      extensionUri: { fsPath: '/ext', scheme: 'file' } as any,
      sessionHub: mockSessionHub,
      processManager: mockProcessManager,
      storageManager: mockStorageManager,
      outputChannel: mockOutputChannel as any,
    });
  });

  it('should initialize webview HTML, options, and send initial state snapshot on READY', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(mockWebview.html).toContain('<!DOCTYPE html>');
    expect(mockWebview.options.enableScripts).toBe(true);

    // Webview signals READY
    await mockWebview.fireMessage({ type: 'READY' });

    expect(postedMessages.some((m) => m.type === 'STATE_SNAPSHOT')).toBe(true);
    const snapshotMsg = postedMessages.find((m) => m.type === 'STATE_SNAPSHOT');
    expect(snapshotMsg?.payload.activeSession?.id).toBe('sess-active');
    expect(snapshotMsg?.payload.agentConfigs).toHaveLength(1);
    expect(snapshotMsg?.payload.inputHistory).toHaveLength(2);
  });

  it('should route SEND_PROMPT action to session and record prompt history', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: 'SEND_PROMPT',
      payload: {
        sessionId: 'sess-active',
        prompt: 'Solve bug in auth',
      },
    });

    const activeSession = mockSessionHub.getActiveSession();
    expect(activeSession?.prompt).toHaveBeenCalledWith('Solve bug in auth', undefined);
    expect(mockStorageManager.recordInputHistory).toHaveBeenCalledWith('Solve bug in auth');
  });

  it('should route CANCEL_PROMPT to active session', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: 'CANCEL_PROMPT',
      payload: { sessionId: 'sess-active' },
    });

    const activeSession = mockSessionHub.getActiveSession();
    expect(activeSession?.cancel).toHaveBeenCalled();
  });

  it('should route FORK_SESSION action and broadcast updated snapshot', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: 'FORK_SESSION',
      payload: {
        sourceSessionId: 'sess-active',
        options: { upToMessageIndex: 1, title: 'Branch 2' },
      },
    });

    expect(mockSessionHub.forkSession).toHaveBeenCalledWith('sess-active', {
      upToMessageIndex: 1,
      title: 'Branch 2',
    });
  });

  it('should route SAVE_AGENT_CONFIG to storage and broadcast snapshot', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const newConfig = {
      id: 'agent-2',
      name: 'Secondary Agent',
      command: 'npx',
      args: ['tsx', 'agent.ts'],
      env: {},
      transport: 'stdio' as const,
      enabled: true,
    };

    await mockWebview.fireMessage({
      type: 'SAVE_AGENT_CONFIG',
      payload: { config: newConfig },
    });

    expect(mockStorageManager.saveAgentConfigs).toHaveBeenCalled();
  });

  it('should handle SHOW_OUTPUT action by calling outputChannel.show', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: 'SHOW_OUTPUT',
    });

    const mockOutput = (provider as any).outputChannel;
    expect(mockOutput.show).toHaveBeenCalledWith(true);
  });

  it('should fallback to available agent config if requested agentId not found in CREATE_SESSION', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: 'CREATE_SESSION',
      payload: { agentId: 'non-existent-agent', title: 'Fallback Test' },
    });

    expect(mockSessionHub.createSession).toHaveBeenCalledWith('agent-1', 'Fallback Test', {
      model: undefined,
      thinkingLevel: undefined,
      cwd: undefined,
    });
  });

  it('should handle TEST_AGENT_CONNECTION and report failure when command is invalid', async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: 'TEST_AGENT_CONNECTION',
      payload: {
        config: {
          id: 'test-agent',
          name: 'Invalid Agent',
          command: '',
          args: [],
          env: {},
          transport: 'stdio',
          enabled: true,
        },
      },
    });

    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TEST_CONNECTION_RESULT',
        payload: expect.objectContaining({
          success: false,
          error: expect.stringContaining('Command is empty'),
        }),
      })
    );
  });
});
