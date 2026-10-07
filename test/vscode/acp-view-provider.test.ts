import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { AcpViewProvider } from "../../src/vscode/acp-view-provider";
import type { ISessionHub, ISession } from "../../src/core/session/session-hub";
import type {
  IProcessPort,
  IStoragePort,
  Disposable,
} from "../../src/core/ports";
import type {
  WebviewAction,
  ExtensionMessage,
} from "../../src/shared/ipc-protocol";
import type { SessionSummary } from "../../src/core/types/session";

describe("T2: AcpViewProvider & Unidirectional IPC Bridge", () => {
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
        return {
          dispose: () => {
            messageHandler = null;
          },
        };
      },
      html: "",
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
      id: "sess-active",
      agentId: "agent-1",
      title: "Active Session",
      status: "idle",
      messages: [],
      prompt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      respondPermission: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockReturnValue({ dispose: () => {} }),
      serialize: vi.fn().mockReturnValue({
        id: "sess-active",
        agentId: "agent-1",
        title: "Active Session",
        status: "idle",
        messages: [],
        createdAt: 1000,
        updatedAt: 1000,
      }),
    };

    const sessionsList: SessionSummary[] = [
      {
        id: "sess-active",
        agentId: "agent-1",
        title: "Active Session",
        status: "idle",
        messageCount: 0,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    mockSessionHub = {
      connectAgent: vi.fn().mockResolvedValue(undefined),
      getActiveAgentId: vi.fn(() => "agent-1"), setActiveAgent: vi.fn(),
      listConnections: vi.fn(() => []), getConnection: vi.fn(),
      disconnectAgent: vi.fn().mockResolvedValue(undefined), closeSession: vi.fn().mockResolvedValue(undefined),
      listAgentSessionPage: vi.fn().mockResolvedValue({ sessions: [] }),
      createSession: vi.fn().mockResolvedValue(mockSession),
      forkSession: vi
        .fn()
        .mockResolvedValue({ ...mockSession, id: "sess-forked" }),
      rewindSession: vi.fn().mockResolvedValue(mockSession),
      getSession: vi.fn().mockReturnValue(mockSession),
      restoreSession: vi.fn().mockResolvedValue(mockSession),
      listSessions: vi.fn().mockReturnValue(sessionsList),
      listAgentSessions: vi.fn().mockResolvedValue([
        {
          id: "sess-agent-remote",
          agentId: "agent-1",
          title: "Remote Agent Session",
          updatedAt: 2000,
          status: "idle",
          messageCount: 5,
        },
      ]),
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
      getStatus: vi.fn().mockReturnValue("running"),
      onStatusChange: vi.fn().mockReturnValue({ dispose: () => {} }),
      dispose: vi.fn(),
    };

    mockStorageManager = {
      recordInputHistory: vi.fn().mockResolvedValue(undefined),
      getInputHistory: vi.fn().mockResolvedValue(["prompt 1", "prompt 2"]),
      saveAgentConfigs: vi.fn().mockResolvedValue(undefined),
      getAgentConfigs: vi.fn().mockResolvedValue([
        {
          id: "agent-1",
          name: "Main Agent",
          command: "node",
          args: [],
          env: {},
          transport: "stdio",
          enabled: true,
        },
      ]),
    };

    const mockOutputChannel = {
      appendLine: vi.fn(),
      show: vi.fn(),
    };

    provider = new AcpViewProvider({
      extensionUri: { fsPath: "/ext", scheme: "file" } as any,
      sessionHub: mockSessionHub,
      processManager: mockProcessManager,
      storageManager: mockStorageManager,
      outputChannel: mockOutputChannel as any,
    });
  });

  it("rejects correlated prompt setup failures without acceptance", async () => {
    vi.mocked(mockSessionHub.getSession).mockReturnValue(undefined);
    vi.mocked(mockSessionHub.getActiveSession).mockReturnValue(undefined);
    vi.mocked(mockSessionHub.createSession).mockRejectedValue(
      new Error("Setup failed"),
    );
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: {
        sessionId: "",
        requestId: "r-setup",
        prompt: [{ type: "text", text: "attachment context" }],
      },
    });
    expect(postedMessages).toContainEqual({
      type: "PROMPT_RESULT",
      payload: {
        requestId: "r-setup",
        sessionId: "",
        status: "rejected",
        error: "Setup failed",
      },
    });
    expect(
      postedMessages.some(
        (m) => m.type === "PROMPT_RESULT" && m.payload.status === "accepted",
      ),
    ).toBe(false);
  });

  it("reports accepted then correlated completion failure", async () => {
    const session = mockSessionHub.getActiveSession()!;
    vi.mocked(session.prompt).mockRejectedValue(new Error("Remote failed"));
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: { sessionId: session.id, requestId: "r-fail", prompt: "hello" },
    });
    await vi.waitFor(() =>
      expect(postedMessages).toContainEqual({
        type: "PROMPT_RESULT",
        payload: {
          requestId: "r-fail",
          agentId: session.agentId,
          sessionId: session.id,
          status: "rejected",
          error: "Remote failed",
        },
      }),
    );
    expect(postedMessages).toContainEqual({
      type: "PROMPT_RESULT",
      payload: {
        requestId: "r-fail",
        agentId: session.agentId,
        sessionId: session.id,
        status: "accepted",
      },
    });
  });

  it("rejects repeated submissions to a streaming session before acceptance", async () => {
    const session = mockSessionHub.getActiveSession()!;
    Object.assign(session, { status: "streaming" });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: { sessionId: session.id, requestId: "r-busy", prompt: "hello" },
    });
    expect(session.prompt).not.toHaveBeenCalled();
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: "PROMPT_RESULT",
        payload: expect.objectContaining({
          requestId: "r-busy",
          status: "rejected",
        }),
      }),
    );
  });

  it("rejects concurrent setup without creating two sessions", async () => {
    vi.mocked(mockSessionHub.getActiveSession).mockReturnValue(undefined);
    let finish!: (session: ISession) => void;
    const created = {
      id: "created",
      agentId: "agent-1",
      status: "idle",
      prompt: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockReturnValue({ dispose: () => {} }),
    } as unknown as ISession;
    vi.mocked(mockSessionHub.createSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    const first = mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: { sessionId: "", requestId: "first", prompt: "one" },
    });
    await vi.waitFor(() =>
      expect(mockSessionHub.createSession).toHaveBeenCalledTimes(1),
    );
    await mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: { sessionId: "", requestId: "second", prompt: "two" },
    });
    expect(mockSessionHub.createSession).toHaveBeenCalledTimes(1);
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: "PROMPT_RESULT",
        payload: expect.objectContaining({
          requestId: "second",
          status: "rejected",
        }),
      }),
    );
    finish(created);
    await first;
  });

  it.each(["different-active", "no-active", "unknown"])(
    "honors explicitly selected Agent with %s",
    async (scenario) => {
      const active = mockSessionHub.getActiveSession()!;
      const config = {
        id: "agent-2",
        name: "Second",
        command: "node",
        args: [],
        env: {},
        transport: "stdio" as const,
        enabled: true,
      };
      vi.mocked(mockStorageManager.getAgentConfigs).mockResolvedValue([config]);
      if (scenario === "no-active")
        vi.mocked(mockSessionHub.getActiveSession).mockReturnValue(undefined);
      const created = {
        ...active,
        id: "second-session",
        agentId: "agent-2",
        prompt: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(mockSessionHub.createSession).mockResolvedValue(created);
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      await mockWebview.fireMessage({
        type: "SEND_PROMPT",
        payload: {
          sessionId: "",
          agentId: scenario === "unknown" ? "unknown" : "agent-2",
          requestId: "selected",
          prompt: "hello",
        },
      });
      expect(active.prompt).not.toHaveBeenCalled();
      if (scenario === "unknown") {
        expect(mockSessionHub.createSession).not.toHaveBeenCalled();
        expect(postedMessages).toContainEqual(
          expect.objectContaining({
            type: "PROMPT_RESULT",
            payload: expect.objectContaining({
              requestId: "selected",
              status: "rejected",
            }),
          }),
        );
      } else {
        expect(mockSessionHub.createSession).toHaveBeenCalledWith(
          "agent-2",
          undefined,
          expect.any(Object),
        );
        expect(created.prompt).toHaveBeenCalledWith("hello", undefined);
      }
    },
  );

  it("rejects synchronous prompt validation before acceptance", async () => {
    const session = mockSessionHub.getActiveSession()!;
    vi.mocked(session.prompt).mockImplementation(() => {
      throw new Error("Invalid prompt");
    });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: { sessionId: session.id, requestId: "invalid", prompt: "hello" },
    });
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: "PROMPT_RESULT",
        payload: expect.objectContaining({
          requestId: "invalid",
          status: "rejected",
        }),
      }),
    );
    expect(
      postedMessages.some(
        (m) => m.type === "PROMPT_RESULT" && m.payload.status === "accepted",
      ),
    ).toBe(false);
  });

  it("connects an Agent without creating a chat", async () => {
    const connectAgent = vi.fn().mockResolvedValue(undefined);
    Object.assign(mockSessionHub, { connectAgent });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "CONNECT_AGENT",
      payload: { agentId: "agent-1" },
    });
    expect(connectAgent).toHaveBeenCalledWith("agent-1");
    expect(mockSessionHub.createSession).not.toHaveBeenCalled();
  });

  it("rejects WebSocket save, create, connect, restart and probe", async () => {
    const config = {
      id: "ws",
      name: "WebSocket",
      command: "node",
      args: [],
      env: {},
      transport: "websocket" as const,
      enabled: true,
    };
    vi.mocked(mockStorageManager.getAgentConfigs).mockResolvedValue([config]);
    const connectAgent = vi.fn();
    Object.assign(mockSessionHub, { connectAgent });
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "SAVE_AGENT_CONFIG",
      payload: { config },
    });
    await mockWebview.fireMessage({
      type: "CREATE_SESSION",
      payload: { agentId: "ws" },
    });
    await mockWebview.fireMessage({
      type: "CONNECT_AGENT",
      payload: { agentId: "ws" },
    });
    await mockWebview.fireMessage({
      type: "RESTART_AGENT_PROCESS",
      payload: { agentId: "ws" },
    });
    await mockWebview.fireMessage({
      type: "TEST_AGENT_CONNECTION",
      payload: { config },
    });
    expect(mockStorageManager.saveAgentConfigs).not.toHaveBeenCalled();
    expect(mockSessionHub.createSession).not.toHaveBeenCalled();
    expect(connectAgent).not.toHaveBeenCalled();
    expect(mockProcessManager.restart).not.toHaveBeenCalled();
    expect(postedMessages).toContainEqual(
      expect.objectContaining({
        type: "TEST_CONNECTION_RESULT",
        payload: expect.objectContaining({
          success: false,
          error: expect.stringContaining("WebSocket"),
        }),
      }),
    );
  });

  it.each([
    "partial",
    "stale",
    "cancelled",
    "changed-after-confirmation",
    "complete",
  ])("safely handles %s diff requests", async (scenario) => {
    const readFile = vi
      .fn()
      .mockResolvedValue(scenario === "stale" ? "changed" : "original");
    if (scenario === "changed-after-confirmation")
      readFile.mockResolvedValueOnce("original").mockResolvedValue("changed");
    const applyFileEdit = vi.fn().mockResolvedValue(true);
    const writeFile = vi.fn();
    Object.assign(provider, {
      workspaceAdapter: { readFile, applyFileEdit, writeFile },
    });
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      (scenario === "cancelled" ? undefined : "Apply") as any,
    );
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    await mockWebview.fireMessage({
      type: "APPLY_FILE_DIFF",
      payload: {
        filePath: "/mock/workspace/a.ts",
        originalContent: scenario === "partial" ? undefined : "original",
        content: "modified",
      },
    });
    expect(writeFile).not.toHaveBeenCalled();
    if (scenario === "complete")
      expect(applyFileEdit).toHaveBeenCalledWith(
        "/mock/workspace/a.ts",
        "original",
        "modified",
      );
    else expect(applyFileEdit).not.toHaveBeenCalled();
  });

  it("discards delayed snapshots after switching the active session", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    let finish!: (
      configs: Awaited<ReturnType<IStoragePort["getAgentConfigs"]>>,
    ) => void;
    vi.mocked(mockStorageManager.getAgentConfigs).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const delayed = provider.broadcastStateSnapshot();
    const active = mockSessionHub.getActiveSession()!;
    const next = {
      ...active,
      id: "next",
      serialize: vi.fn().mockReturnValue({ ...active.serialize(), id: "next" }),
    };
    vi.mocked(mockSessionHub.getActiveSession).mockReturnValue(next);
    await provider.broadcastStateSnapshot();
    finish([]);
    await delayed;
    const snapshots = postedMessages.filter((m) => m.type === "STATE_SNAPSHOT");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].payload.activeSession?.id).toBe("next");
  });

  it("should initialize webview HTML, options, and send initial state snapshot on READY", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    expect(mockWebview.html).toContain("<!DOCTYPE html>");
    expect(mockWebview.options.enableScripts).toBe(true);

    // Webview signals READY
    await mockWebview.fireMessage({ type: "READY" });

    expect(postedMessages.some((m) => m.type === "STATE_SNAPSHOT")).toBe(true);
    const snapshotMsg = postedMessages.find((m) => m.type === "STATE_SNAPSHOT");
    expect(snapshotMsg?.payload.activeSession?.id).toBe("sess-active");
    expect(snapshotMsg?.payload.agentConfigs).toHaveLength(1);
    expect(snapshotMsg?.payload.inputHistory).toHaveLength(2);
  });

  it("should route SEND_PROMPT action to session and record prompt history", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "SEND_PROMPT",
      payload: {
        sessionId: "sess-active",
        prompt: "Solve bug in auth",
      },
    });

    const activeSession = mockSessionHub.getActiveSession();
    expect(activeSession?.prompt).toHaveBeenCalledWith(
      "Solve bug in auth",
      undefined,
    );
    expect(mockStorageManager.recordInputHistory).toHaveBeenCalledWith(
      "Solve bug in auth",
    );
  });

  it("should route CANCEL_PROMPT to active session", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "CANCEL_PROMPT",
      payload: { sessionId: "sess-active" },
    });

    const activeSession = mockSessionHub.getActiveSession();
    expect(activeSession?.cancel).toHaveBeenCalled();
  });

  it("should route FORK_SESSION action and broadcast updated snapshot", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "FORK_SESSION",
      payload: {
        sourceSessionId: "sess-active",
        options: { upToMessageIndex: 1, title: "Branch 2" },
      },
    });

    expect(mockSessionHub.forkSession).toHaveBeenCalledWith("sess-active", {
      upToMessageIndex: 1,
      title: "Branch 2",
    });
  });

  it("restores the history snapshot when deletion fails", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    vi.mocked(mockSessionHub.deleteSession).mockRejectedValueOnce(
      new Error("Agent refused deletion"),
    );

    await mockWebview.fireMessage({
      type: "DELETE_SESSION",
      payload: { sessionId: "sess-active" },
    });

    expect(
      postedMessages.some((message) => message.type === "STATE_SNAPSHOT"),
    ).toBe(true);
  });

  it("should route SAVE_AGENT_CONFIG to storage and broadcast snapshot", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const newConfig = {
      id: "agent-2",
      name: "Secondary Agent",
      command: "npx",
      args: ["tsx", "agent.ts"],
      env: {},
      transport: "stdio" as const,
      enabled: true,
    };

    await mockWebview.fireMessage({
      type: "SAVE_AGENT_CONFIG",
      payload: { config: newConfig },
    });

    expect(mockStorageManager.saveAgentConfigs).toHaveBeenCalled();
  });

  it("should handle SHOW_OUTPUT action by calling outputChannel.show", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "SHOW_OUTPUT",
    });

    const mockOutput = (provider as any).outputChannel;
    expect(mockOutput.show).toHaveBeenCalledWith(true);
  });

  it("rejects an unknown explicitly requested Agent when creating a session", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "CREATE_SESSION",
      payload: { agentId: "non-existent-agent", title: "Fallback Test" },
    });

    expect(mockSessionHub.createSession).not.toHaveBeenCalled();
  });

  it("should handle TEST_AGENT_CONNECTION and report failure when command is invalid", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "TEST_AGENT_CONNECTION",
      payload: {
        config: {
          id: "test-agent",
          name: "Invalid Agent",
          command: "",
          args: [],
          env: {},
          transport: "stdio",
          enabled: true,
        },
      },
    });

    expect(mockWebview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TEST_CONNECTION_RESULT",
        payload: expect.objectContaining({
          success: false,
          error: expect.stringContaining("command must be nonempty"),
        }),
      }),
    );
  });

  it("should handle SET_CONFIG_OPTION and forward to active session", async () => {
    const mockSession = mockSessionHub.getActiveSession() as any;
    mockSession.setConfigOption = vi.fn().mockResolvedValue(undefined);
    mockSession.serialize = vi.fn().mockReturnValue({ modelConfigId: "model" });

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "SET_CONFIG_OPTION",
      payload: {
        sessionId: "sess-active",
        configId: "model",
        value: "codex.openai:gpt-5.6-sol",
      },
    });

    expect(mockSession.setConfigOption).toHaveBeenCalledWith(
      "model",
      "codex.openai:gpt-5.6-sol",
    );
  });

  it("should default session cwd to active workspace folder when creating session without explicit cwd", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "CREATE_SESSION",
      payload: {
        agentId: "agent-1",
        title: "Test Session",
      },
    });

    expect(mockSessionHub.createSession).toHaveBeenCalledWith(
      "agent-1",
      "Test Session",
      expect.objectContaining({
        cwd: "/mock/workspace",
      }),
    );
  });

  it("should resolve ${workspaceFolder} placeholder in custom cwd", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "CREATE_SESSION",
      payload: {
        agentId: "agent-1",
        title: "Subdir Session",
        cwd: "${workspaceFolder}/sub-project",
      },
    });

    expect(mockSessionHub.createSession).toHaveBeenCalledWith(
      "agent-1",
      "Subdir Session",
      expect.objectContaining({
        cwd: "/mock/workspace/sub-project",
      }),
    );
  });

  it("should handle SWITCH_SESSION and restore session via sessionHub", async () => {
    (mockSessionHub as any).restoreSession = vi.fn().mockResolvedValue({
      id: "session-restored-1",
      agentId: "agent-1",
      serialize: () => ({
        id: "session-restored-1",
        agentId: "agent-1",
        messages: [],
      }),
    });

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "SWITCH_SESSION",
      payload: {
        sessionId: "session-restored-1",
      },
    });

    expect((mockSessionHub as any).restoreSession).toHaveBeenCalledWith(
      "session-restored-1",
      "agent-1",
      expect.any(String),
    );
  });

  it("refreshes current runtime state without querying remote history", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "REFRESH_SESSIONS",
    });

    expect(mockSessionHub.listAgentSessions).not.toHaveBeenCalled();
    const lastMsg = postedMessages[postedMessages.length - 1];
    expect(lastMsg?.type).toBe("STATE_SNAPSHOT");
    const sessionIds = (lastMsg?.payload as any)?.sessions.map(
      (s: any) => s.id,
    );
    expect(sessionIds).toContain("sess-active");
    expect(sessionIds).not.toContain("sess-agent-remote");
  });

  it.each(["media/icon.png", "media/photo.jpg", "docs/report.pdf", "data/archive.bin"])(
    "opens %s through VS Code's native resource editor",
    async (filePath) => {
      const openText = vi.spyOn(vscode.workspace, "openTextDocument").mockRejectedValue(
        new Error("File seems to be binary and cannot be opened as text"),
      );
      const openResource = vi.spyOn(vscode.commands, "executeCommand");
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
      await mockWebview.fireMessage({ type: "OPEN_FILE", payload: { filePath } });
      expect(openResource).toHaveBeenCalledWith(
        "vscode.open",
        expect.objectContaining({ fsPath: `/mock/workspace/${filePath}` }),
        {},
      );
      expect(openText).not.toHaveBeenCalled();
    },
  );

  it("should handle OPEN_FILE by opening document in workspace editor", async () => {
    const openResource = vi.spyOn(vscode.commands, "executeCommand");
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    await mockWebview.fireMessage({
      type: "OPEN_FILE",
      payload: {
        filePath: "src/index.ts",
        startLine: 15,
        endLine: 30,
      },
    });

    expect(openResource).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({ fsPath: "/mock/workspace/src/index.ts" }),
      expect.objectContaining({
        selection: expect.objectContaining({
          start: { line: 14, character: 0 },
          end: { line: 29, character: 0 },
        }),
      }),
    );
  });

  it("should resolve partial/subpath file via workspace findFiles fuzzy search", async () => {
    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

    const fullMatchedUri = vscode.Uri.file(
      "/mock/workspace/packages/services/src/aharness/services/workspace/service/workspace_scanner.py",
    );

    const openResource = vi.spyOn(vscode.commands, "executeCommand");
    // Make direct stat fail so it falls through to findFiles
    vi.spyOn(vscode.workspace.fs, "stat").mockRejectedValue(
      new Error("File not found"),
    );
    // Make findFiles return the candidate matching basename
    vi.spyOn(vscode.workspace, "findFiles").mockImplementation(
      async (pattern) => {
        const glob = typeof pattern === "string" ? pattern : pattern.pattern;
        if (glob.includes("workspace_scanner.py")) {
          return [fullMatchedUri];
        }
        return [];
      },
    );

    await mockWebview.fireMessage({
      type: "OPEN_FILE",
      payload: {
        filePath: "application/workspace/service/workspace_scanner.py",
        startLine: 10,
        endLine: 25,
      },
    });

    expect(openResource).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({ fsPath: fullMatchedUri.fsPath }),
      expect.objectContaining({
        selection: expect.objectContaining({
          start: { line: 9, character: 0 },
          end: { line: 24, character: 0 },
        }),
      }),
    );
  });
});
