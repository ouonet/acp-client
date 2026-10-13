import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { AcpChatParticipant } from "../../src/vscode/chat-participant";

describe("T5: VS Code Native Chat Participant (@acp)", () => {
  let mockSessionHub: any;
  let mockStorageManager: any;
  let mockSession: any;
  let eventListeners: Array<(event: any) => void>;

  beforeEach(() => {
    eventListeners = [];
    mockSession = {
      id: "session-123",
      prompt: vi.fn().mockImplementation(async (text: string) => {
        // simulate streaming chunks
        for (const listener of eventListeners) {
          listener({
            type: "chunk",
            sessionId: "session-123",
            payload: { content: `Echo: ${text}`, text: `Echo: ${text}` },
          });
        }
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockImplementation((listener) => {
        eventListeners.push(listener);
        return {
          dispose: () => {
            eventListeners = eventListeners.filter((l) => l !== listener);
          },
        };
      }),
    };

    mockSessionHub = {
      getActiveSession: vi.fn().mockReturnValue(mockSession),
      getActiveAgentId: vi.fn().mockReturnValue("active-agent"),
      createSession: vi.fn().mockResolvedValue(mockSession),
      forkSession: vi.fn().mockResolvedValue({ id: "forked-session-456" }),
    };

    mockStorageManager = {
      getAgentConfigs: vi
        .fn()
        .mockResolvedValue([{ id: "default-agent", name: "Default Agent" }, { id: "active-agent", name: "Active" }]),
    };
  });

  it("should register ChatParticipant with id acpClient.acpParticipant", () => {
    const createSpy = vi.spyOn(vscode.chat, "createChatParticipant");
    const participant = new AcpChatParticipant({
      sessionHub: mockSessionHub,
      storageManager: mockStorageManager,
    });

    expect(createSpy).toHaveBeenCalledWith(
      "acpClient.acpParticipant",
      expect.any(Function),
    );
    expect(participant).toBeDefined();
  });

  it("should forward prompt to active session and stream chunk markdown", async () => {
    const participant = new AcpChatParticipant({
      sessionHub: mockSessionHub,
      storageManager: mockStorageManager,
    });

    const mockStream: any = {
      markdown: vi.fn(),
      progress: vi.fn(),
    };
    const mockToken: any = {
      onCancellationRequested: vi.fn(),
    };

    await participant.handleRequest(
      { prompt: "Write a quicksort in TS", command: undefined } as any,
      {} as any,
      mockStream,
      mockToken,
    );

    expect(mockSession.prompt).toHaveBeenCalledWith("Write a quicksort in TS");
    expect(mockStream.markdown).toHaveBeenCalledWith(
      "Echo: Write a quicksort in TS",
    );
  });

  it("should handle /clear command by creating a fresh session", async () => {
    const participant = new AcpChatParticipant({
      sessionHub: mockSessionHub,
      storageManager: mockStorageManager,
    });

    const mockStream: any = {
      markdown: vi.fn(),
      progress: vi.fn(),
    };

    await participant.handleRequest(
      { prompt: "", command: "clear" } as any,
      {} as any,
      mockStream,
      { onCancellationRequested: vi.fn() } as any,
    );

    expect(mockSessionHub.createSession).toHaveBeenCalledWith(
      "active-agent",
      "Chat Session",
    );
    expect(mockStream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Cleared active session"),
    );
  });

  it("should handle /fork command by forking active session", async () => {
    const participant = new AcpChatParticipant({
      sessionHub: mockSessionHub,
      storageManager: mockStorageManager,
    });

    const mockStream: any = {
      markdown: vi.fn(),
      progress: vi.fn(),
    };

    await participant.handleRequest(
      { prompt: "", command: "fork" } as any,
      {} as any,
      mockStream,
      { onCancellationRequested: vi.fn() } as any,
    );

    expect(mockSessionHub.forkSession).toHaveBeenCalledWith("session-123");
    expect(mockStream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Forked session"),
    );
  });

  it("should hook token cancellation to session cancel", async () => {
    let cancelCallback: (() => Promise<void>) | undefined;
    const mockToken: any = {
      onCancellationRequested: vi.fn().mockImplementation((cb) => {
        cancelCallback = cb;
      }),
    };

    const participant = new AcpChatParticipant({
      sessionHub: mockSessionHub,
      storageManager: mockStorageManager,
    });

    await participant.handleRequest(
      { prompt: "Long task", command: undefined } as any,
      {} as any,
      { markdown: vi.fn(), progress: vi.fn() } as any,
      mockToken,
    );

    expect(cancelCallback).toBeDefined();
    if (cancelCallback) {
      await cancelCallback();
      expect(mockSession.cancel).toHaveBeenCalled();
    }
  });

  it("asks with a quick pick and returns the selected permission option", async () => {
    mockSession.respondPermission = vi.fn().mockResolvedValue(undefined);
    mockSession.prompt = vi.fn().mockImplementation(async () => {
      for (const listener of eventListeners) {
        listener({
          type: "permission_request",
          payload: {
            requestId: "perm-1",
            toolTitle: "Run shell",
            options: [
              { optionId: "reject", name: "Reject", kind: "reject_once" },
              { optionId: "once", name: "Allow once", kind: "allow_once" },
            ],
          },
        });
      }
    });
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue({
      label: "Reject",
      optionId: "reject",
      decisionKind: "reject_once",
    } as any);

    const participant = new AcpChatParticipant({
      sessionHub: mockSessionHub,
      storageManager: mockStorageManager,
    });
    await participant.handleRequest(
      { prompt: "run tests", command: undefined } as any,
      {} as any,
      { markdown: vi.fn(), progress: vi.fn() } as any,
      { onCancellationRequested: vi.fn() } as any,
    );
    await Promise.resolve();

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(mockSession.respondPermission).toHaveBeenCalledWith("perm-1", "deny", { optionId: "reject" });
  });
});
