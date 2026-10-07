// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "preact";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { ChatView } from "../../src/webview/components/chat/chat-view";

describe("T6: Preact ChatView, Turns, Thinking, Tools & PermissionGate", () => {
  let container: HTMLElement;
  let store: AppStore;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    store = new AppStore();
    onAction = vi.fn();

    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeSession: {
          id: "sess-1",
          agentId: "agent-1",
          title: "Session 1",
          status: "idle",
          messages: [
            {
              role: "user",
              content: "Please check this bug",
              timestamp: 1000,
            },
            {
              role: "assistant",
              content: "I am analyzing the codebase now.",
              thinking: "Step 1: check files.\nStep 2: fix issues.",
              toolCalls: [
                {
                  id: "call-1",
                  title: "readFile",
                  input: { path: "src/index.ts" },
                  status: "completed",
                  output: "export const app = 1;",
                },
              ],
              timestamp: 2000,
            },
          ],
        },
      },
    });
  });

  it("ChatView renders user bubble, assistant turn, thinking card, and tool calls", async () => {
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <ChatView />
        </ActionProvider>
      </StoreProvider>,
      container,
    );
    await new Promise((r) => setTimeout(r, 20));

    // User message
    const userBubble = container.querySelector(".user-bubble");
    expect(userBubble).not.toBeNull();
    expect(userBubble?.textContent).toContain("Please check this bug");

    // Assistant message
    const assistantTurn = container.querySelector(".assistant-turn");
    expect(assistantTurn).not.toBeNull();
    expect(assistantTurn?.textContent).toContain("I am analyzing the codebase now.");

    // Thinking card
    const thinkingCard = container.querySelector(".thinking-card");
    expect(thinkingCard).not.toBeNull();
    expect(thinkingCard?.classList.contains("expanded")).toBe(false);

    // Toggle thinking card
    const thinkingHeader = container.querySelector(".thinking-header") as HTMLElement;
    thinkingHeader.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector(".thinking-card.expanded")).not.toBeNull();

    // Tool call card
    const toolCard = container.querySelector(".tool-call-card");
    expect(toolCard).not.toBeNull();
    expect(toolCard?.textContent).toContain("readFile");
  });

  it("ChatView renders PermissionGate when pendingPermission is present and dispatches action", async () => {
    store.dispatch({
      type: "PERMISSION_REQUEST",
      payload: {
        sessionId: "sess-1",
        requestId: "req-99",
        toolTitle: "executeCommand: rm -rf",
        options: [
          { optionId: "opt-allow", name: "Allow Once", kind: "allow" },
          { optionId: "opt-deny", name: "Deny", kind: "deny" },
        ],
      },
    });

    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <ChatView />
        </ActionProvider>
      </StoreProvider>,
      container,
    );
    await new Promise((r) => setTimeout(r, 20));

    const gate = container.querySelector(".permission-gate");
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toContain("executeCommand: rm -rf");

    const allowBtn = container.querySelector('[data-decision="allow"]') as HTMLButtonElement;
    expect(allowBtn).not.toBeNull();
    allowBtn.click();

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RESPOND_PERMISSION",
        payload: expect.objectContaining({
          requestId: "req-99",
          decision: "allow",
        }),
      }),
    );
  });

  it("ChatView renders active streaming text in real time", async () => {
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <ChatView />
        </ActionProvider>
      </StoreProvider>,
      container,
    );
    await new Promise((r) => setTimeout(r, 20));

    store.dispatch({ type: "SESSION_STATUS_CHANGE", payload: { status: "streaming" } });
    store.dispatch({ type: "CHUNK", payload: "Streaming chunk 1..." });
    await new Promise((r) => setTimeout(r, 20));

    const streamingEl = container.querySelector(".streaming-turn");
    expect(streamingEl).not.toBeNull();
    expect(streamingEl?.textContent).toContain("Streaming chunk 1...");
  });
});
