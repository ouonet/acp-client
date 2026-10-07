// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatViewComponent } from "../../src/webview/components/chat-view";

describe("T2: Webview Permission Gate Card", () => {
  let container: HTMLElement;
  let onAction: ReturnType<typeof vi.fn>;
  let chatView: ChatViewComponent;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    onAction = vi.fn();

    chatView = new ChatViewComponent({
      container,
      onAction,
    });
  });

  it("should render permission request options and dispatch three-tier decisions", () => {
    chatView.renderPermissionPrompt({
      sessionId: "sess-123",
      requestId: "req-456",
      toolTitle: "fs/writeFile",
      options: [
        { optionId: "opt-1", name: "Allow Once", kind: "allow_once" },
        {
          optionId: "opt-2",
          name: "Always Allow in Session",
          kind: "allow_always",
        },
        { optionId: "opt-3", name: "Deny", kind: "deny" },
      ],
    });

    const card = container.querySelector(".tool-approval-card") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("fs/writeFile");

    const buttons = card.querySelectorAll(".btn-perm-action");
    expect(buttons.length).toBe(3);

    // Click "Always Allow in Session"
    (buttons[1] as HTMLElement).click();

    expect(onAction).toHaveBeenCalledWith({
      type: "RESPOND_PERMISSION",
      payload: {
        sessionId: "sess-123",
        requestId: "req-456",
        decision: "always_allow_session",
        optionId: "opt-2",
      },
    });

    // Card should be removed after decision
    expect(container.querySelector(".tool-approval-card")).toBeNull();
  });

  it("should dispatch allow for Allow Once and deny for Deny button", () => {
    // 1. Allow Once
    chatView.renderPermissionPrompt({
      sessionId: "sess-123",
      requestId: "req-1",
      toolTitle: "terminal/run",
      options: [
        { optionId: "opt-1", name: "Allow Once", kind: "allow_once" },
        { optionId: "opt-3", name: "Deny", kind: "deny" },
      ],
    });

    let card = container.querySelector(".tool-approval-card") as HTMLElement;
    (card.querySelectorAll(".btn-perm-action")[0] as HTMLElement).click();

    expect(onAction).toHaveBeenLastCalledWith({
      type: "RESPOND_PERMISSION",
      payload: {
        sessionId: "sess-123",
        requestId: "req-1",
        decision: "allow",
        optionId: "opt-1",
      },
    });

    // 2. Deny
    chatView.renderPermissionPrompt({
      sessionId: "sess-123",
      requestId: "req-2",
      toolTitle: "terminal/run",
      options: [
        { optionId: "opt-1", name: "Allow Once", kind: "allow_once" },
        { optionId: "opt-3", name: "Deny", kind: "deny" },
      ],
    });

    card = container.querySelector(".tool-approval-card") as HTMLElement;
    (card.querySelectorAll(".btn-perm-action")[1] as HTMLElement).click();

    expect(onAction).toHaveBeenLastCalledWith({
      type: "RESPOND_PERMISSION",
      payload: {
        sessionId: "sess-123",
        requestId: "req-2",
        decision: "deny",
        optionId: "opt-3",
      },
    });
  });
});
