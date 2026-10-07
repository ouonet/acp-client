// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebviewApp, vscodeApi } from "../../src/webview/main";
import type { WebviewStateSnapshot } from "../../src/shared/ipc-protocol";

describe("snapshot and prompt reliability", () => {
  const snapshot = (id = "s", status = "streaming"): WebviewStateSnapshot =>
    ({
      agentConfigs: [
        {
          id: "a",
          name: "Agent",
          transport: "stdio",
          command: "agent",
          args: [],
          env: {},
          enabled: true,
        },
      ],
      processStatuses: { a: "running" },
      sessions: [],
      inputHistory: [],
      activeSession: {
        id,
        agentId: "a",
        title: "Chat",
        status,
        createdAt: 1,
        updatedAt: 1,
        messages: [{ role: "assistant", content: "first" }],
      },
    }) as WebviewStateSnapshot;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });
  it("keeps streamed text through refresh and rebuilds on switching", () => {
    const app = new WebviewApp();
    const state = snapshot();
    app.handleExtensionMessage({ type: "STATE_SNAPSHOT", payload: state });
    app.handleExtensionMessage({
      type: "SESSION_EVENT",
      payload: {
        sessionId: "s",
        event: {
          sessionId: "s",
          type: "chunk",
          payload: { content: " second" },
        },
      },
    });
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: structuredClone(state),
    });
    expect(document.getElementById("chat-container")!.textContent).toContain(
      "first second",
    );
    app.handleExtensionMessage({
      type: "SESSION_EVENT",
      payload: {
        sessionId: "s",
        event: {
          sessionId: "s",
          type: "chunk",
          payload: { content: " third" },
        },
      },
    });
    expect(document.getElementById("chat-container")!.textContent).toContain(
      "first second third",
    );
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: snapshot("other", "idle"),
    });
    expect(
      document.getElementById("chat-container")!.textContent,
    ).not.toContain("second");
  });
  it("restores pending approval and removes it when snapshot settles", () => {
    const app = new WebviewApp();
    const state = snapshot("s", "waiting_approval");
    state.pendingPermission = {
      requestId: "r",
      toolTitle: "tool",
      options: [{ optionId: "yes", name: "Yes", kind: "allow_once" }],
    };
    app.handleExtensionMessage({ type: "STATE_SNAPSHOT", payload: state });
    expect(document.querySelectorAll(".tool-approval-card")).toHaveLength(1);
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: structuredClone(state),
    });
    expect(document.querySelectorAll(".tool-approval-card")).toHaveLength(1);
    const spy = vi.spyOn(vscodeApi, "postMessage");
    document.querySelector<HTMLButtonElement>(".btn-perm-action")!.click();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RESPOND_PERMISSION",
        payload: expect.objectContaining({
          sessionId: "s",
          requestId: "r",
          optionId: "yes",
        }),
      }),
    );
    app.handleExtensionMessage({ type: "STATE_SNAPSHOT", payload: state });
    expect(document.querySelectorAll(".tool-approval-card")).toHaveLength(1);
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: snapshot("s", "idle"),
    });
    expect(document.querySelectorAll(".tool-approval-card")).toHaveLength(0);
  });
  it("clears stale models even when target session reports no metadata", () => {
    const app = new WebviewApp();
    const state = snapshot("s", "idle");
    state.activeSession!.availableModels = ["old"];
    state.activeSession!.model = "old";
    app.handleExtensionMessage({ type: "STATE_SNAPSHOT", payload: state });
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: snapshot("other", "idle"),
    });
    const select = document.querySelector<HTMLSelectElement>(".model-select")!;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("");
  });
  it("correlates host completion with the submitted draft", () => {
    const app = new WebviewApp();
    const spy = vi.spyOn(vscodeApi, "postMessage");
    const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "draft";
    document.querySelector<HTMLButtonElement>(".btn-toggle-action")!.click();
    const action = spy.mock.calls
      .map(([action]) => action)
      .reverse()
      .find((action: any) => action.type === "SEND_PROMPT") as any;
    expect(action.payload.requestId).toEqual(expect.any(String));
    expect(input.value).toBe("draft");
    app.handleExtensionMessage({
      type: "PROMPT_RESULT",
      payload: {
        requestId: action.payload.requestId,
        sessionId: "s",
        status: "completed",
      },
    });
    expect(input.value).toBe("");
  });
  it("preserves selected Agent across refresh and targets its new chat without stale models", () => {
    const app = new WebviewApp();
    const state = snapshot("s", "idle");
    state.agentConfigs.push({ ...state.agentConfigs[0], id: "b", name: "B" });
    state.activeSession!.model = "old";
    state.activeSession!.availableModels = ["old"];
    app.handleExtensionMessage({ type: "STATE_SNAPSHOT", payload: state });
    const select = document.querySelector<HTMLSelectElement>(
      ".header-agent-select",
    )!;
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: structuredClone(state),
    });
    expect(
      document.querySelector<HTMLSelectElement>(".header-agent-select")!.value,
    ).toBe("b");
    expect(
      document.querySelector<HTMLSelectElement>(".model-select")!.disabled,
    ).toBe(true);
    const spy = vi.spyOn(vscodeApi, "postMessage");
    spy.mockClear();
    const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "for B";
    document.querySelector<HTMLButtonElement>(".btn-toggle-action")!.click();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SEND_PROMPT",
        payload: expect.objectContaining({
          agentId: "b",
          sessionId: "",
          options: { model: undefined, thinkingLevel: undefined },
        }),
      }),
    );
  });
  it("Escape dismisses an open drawer before cancelling generation", () => {
    const app = new WebviewApp();
    app.handleExtensionMessage({ type: "STATE_SNAPSHOT", payload: snapshot() });
    document.getElementById("config-drawer")!.classList.add("open");
    const spy = vi.spyOn(vscodeApi, "postMessage");
    spy.mockClear();
    document
      .querySelector<HTMLTextAreaElement>("textarea")!
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    expect(
      document.getElementById("config-drawer")!.classList.contains("open"),
    ).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    document
      .querySelector<HTMLTextAreaElement>("textarea")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(spy).toHaveBeenCalledWith({
      type: "CANCEL_PROMPT",
      payload: { sessionId: "s" },
    });
  });
  it("clear creates an explicit new chat without sending a prompt", () => {
    const app = new WebviewApp();
    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: snapshot("s", "idle"),
    });
    const spy = vi.spyOn(vscodeApi, "postMessage");
    spy.mockClear();
    const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "/clear";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(spy).toHaveBeenCalledWith({
      type: "CREATE_SESSION",
      payload: { agentId: "a", title: "New Session" },
    });
  });
});

describe("T7: WebviewApp End-to-End Orchestration & IPC Bridge", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app"></div>
    `;
    postMessageSpy = vi.spyOn(vscodeApi, "postMessage");
  });

  it("should initialize DOM structure and emit READY action on mount", () => {
    new WebviewApp();

    expect(document.getElementById("header")).not.toBeNull();
    expect(document.getElementById("chat-container")).not.toBeNull();
    expect(document.getElementById("input-container")).not.toBeNull();
    expect(document.getElementById("config-drawer")).not.toBeNull();
    expect(document.getElementById("history-drawer")).not.toBeNull();

    expect(postMessageSpy).toHaveBeenCalledWith({ type: "READY" });
  });

  it("should handle STATE_SNAPSHOT message and update header, chat, and drawers", () => {
    const app = new WebviewApp();

    const snapshot: WebviewStateSnapshot = {
      activeSession: {
        id: "session-e2e",
        agentId: "claude-code",
        title: "End-to-End Test Session",
        model: "claude-3-7-sonnet",
        thinkingLevel: "high",
        status: "idle",
        createdAt: 1000,
        updatedAt: 2000,
        messages: [
          { role: "user", content: "Can you refactor auth?" },
          {
            role: "assistant",
            content: "Sure, I will refactor it.",
            thinking: "Analyzing auth...",
          },
        ],
      },
      sessions: [
        {
          id: "session-e2e",
          agentId: "claude-code",
          title: "End-to-End Test Session",
          status: "idle",
          messageCount: 2,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      agentConfigs: [
        {
          id: "claude-code",
          name: "Claude Code Agent",
          command: "npx",
          args: [],
          env: {},
          enabled: true,
          transport: "stdio",
        },
      ],
      inputHistory: ["previous prompt 1", "previous prompt 2"],
      processStatuses: {
        "claude-code": "running",
      },
    };

    app.handleExtensionMessage({
      type: "STATE_SNAPSHOT",
      payload: snapshot,
    });

    // Verify Header was updated (Agent selector only, model badge removed per Item 2)
    const header = document.getElementById("header") as HTMLElement;
    expect(header.textContent).toContain("Claude Code Agent");
    const modelSelect = document.querySelector(
      ".model-select",
    ) as HTMLSelectElement;
    expect(modelSelect?.value).toBe("claude-3-7-sonnet");

    // Verify Chat was updated
    const chat = document.getElementById("chat-container") as HTMLElement;
    expect(chat.textContent).toContain("Can you refactor auth?");
    expect(chat.textContent).toContain("Sure, I will refactor it.");

    // Verify InputBox status
    const sendBtn = document.querySelector(
      ".btn-toggle-action",
    ) as HTMLButtonElement;
    expect(sendBtn.classList.contains("send")).toBe(true);
  });

  it("should stream chunks incrementally on SESSION_EVENT", () => {
    const app = new WebviewApp();

    app.handleExtensionMessage({
      type: "SESSION_EVENT",
      payload: {
        sessionId: "session-e2e",
        event: {
          type: "chunk",
          sessionId: "session-e2e",
          payload: {
            content: "Streaming chunk 1... ",
          },
        },
      },
    });

    const chat = document.getElementById("chat-container") as HTMLElement;
    expect(chat.textContent).toContain("Streaming chunk 1...");

    app.handleExtensionMessage({
      type: "SESSION_EVENT",
      payload: {
        sessionId: "session-e2e",
        event: {
          type: "chunk",
          sessionId: "session-e2e",
          payload: {
            content: "and chunk 2.",
          },
        },
      },
    });

    expect(chat.textContent).toContain("Streaming chunk 1... and chunk 2.");
  });

  it("keeps streamed tool calls with the thinking turn that started them", () => {
    const app = new WebviewApp();
    const send = (type: string, payload: any) =>
      app.handleExtensionMessage({
        type: "SESSION_EVENT",
        payload: {
          sessionId: "session-e2e",
          event: { type, sessionId: "session-e2e", payload },
        },
      } as any);

    send("thinking", { thinking: "First reason", turnIndex: 1 });
    send("tool_call", {
      id: "tool-1",
      name: "read_file",
      status: "completed",
      turnIndex: 1,
    });
    send("thinking", { thinking: "", turnIndex: 2 });
    send("tool_call", {
      id: "tool-2",
      name: "list_dir",
      status: "completed",
      turnIndex: 2,
    });

    const turns = document.querySelectorAll(".internal-turn-card");
    expect(turns).toHaveLength(2);
    expect(turns[0].textContent).toContain("read_file");
    expect(turns[1].textContent).toContain("Thinking content unavailable");
    expect(turns[1].textContent).toContain("list_dir");
  });
});
