// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputBoxComponent } from "../../src/webview/components/input-box";
import { DiffViewerComponent } from "../../src/webview/components/diff-viewer";
import { ChatViewComponent } from "../../src/webview/components/chat-view";
import { ConfigPanelComponent } from "../../src/webview/components/config-panel";
import { HeaderComponent } from "../../src/webview/components/header";
import { HistoryDrawerComponent } from "../../src/webview/components/history-drawer";
const agent = (id: string) => ({
  id,
  name: id,
  transport: "stdio" as const,
  command: "agent",
  args: [],
  env: {},
  enabled: true,
});
let container: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.appendChild(container);
});
describe("interaction reliability", () => {
  it("never accepts partial hunks as complete file content", () => {
    const apply = vi.fn();
    new DiffViewerComponent({
      container,
      filePath: "a",
      diff: "@@ -4 +4 @@\n-old\n+new",
      onApply: apply,
    });
    const button =
      container.querySelector<HTMLButtonElement>(".btn-accept-diff")!;
    button.click();
    expect(button.disabled).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });
  it("applies complete empty modified content with original content", () => {
    const apply = vi.fn();
    new DiffViewerComponent({
      container,
      filePath: "a",
      diff: "@@ -1 +0 @@\n-old",
      originalContent: "old",
      modifiedContent: "",
      onApply: apply,
    });
    container.querySelector<HTMLButtonElement>(".btn-accept-diff")!.click();
    expect(apply).toHaveBeenCalledWith("a", "", "old");
  });
  it("retains draft and attachments through acceptance and rejection and blocks duplicate submission", () => {
    const send = vi.fn();
    const box = new InputBoxComponent({
      container,
      onSend: send,
      onCancel: vi.fn(),
    });
    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "draft";
    box.addAttachment({
      id: "a",
      type: "image",
      mimeType: "image/png",
      data: "x",
    });
    box.submit();
    box.submit();
    expect(send).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("draft");
    expect(container.querySelectorAll(".attachment-chip")).toHaveLength(1);
    const requestId = send.mock.calls[0][0].requestId;
    (box as any).handlePromptResult({ requestId, status: "accepted" });
    expect(input.value).toBe("draft");
    (box as any).handlePromptResult({ requestId, status: "rejected" });
    expect(input.value).toBe("draft");
    box.submit();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("only completion clears unchanged draft and ignores stale replies", () => {
    const send = vi.fn();
    const box = new InputBoxComponent({
      container,
      onSend: send,
      onCancel: vi.fn(),
    });
    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "old";
    box.submit();
    const requestId = send.mock.calls[0][0].requestId;
    input.value = "new";
    (box as any).handlePromptResult({ requestId, status: "completed" });
    expect(input.value).toBe("new");
    box.submit();
    (box as any).handlePromptResult({ requestId, status: "completed" });
    expect(input.value).toBe("new");
    (box as any).handlePromptResult({
      requestId: send.mock.calls[1][0].requestId,
      status: "completed",
    });
    expect(input.value).toBe("");
  });
  it("preserves native multiline arrows and cancels with Escape after dismissing popup", () => {
    const cancel = vi.fn();
    const box = new InputBoxComponent({
      container,
      history: ["history"],
      onSend: vi.fn(),
      onCancel: cancel,
    });
    const input = container.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "first\nsecond";
    const up = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      cancelable: true,
    });
    input.dispatchEvent(up);
    expect(input.value).toBe("first\nsecond");
    expect(up.defaultPrevented).toBe(false);
    box.setStatus("streaming");
    input.value = "/";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancel).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("preserves accumulated chunks after rendering a snapshot", () => {
    const chat = new ChatViewComponent({ container, onAction: vi.fn() });
    chat.setSessionId("s");
    chat.setMessages([{ role: "assistant", content: "first" } as any]);
    chat.appendAssistantChunk(" second");
    expect(container.textContent).toContain("first second");
  });
  it("sends exact permission option identifiers", () => {
    const action = vi.fn();
    const chat = new ChatViewComponent({ container, onAction: action });
    chat.renderPermissionPrompt({
      sessionId: "s",
      requestId: "r",
      toolTitle: "tool",
      options: [{ optionId: "yes", name: "Yes", kind: "allow_once" }],
    });
    container.querySelector<HTMLButtonElement>(".btn-perm-action")!.click();
    expect(action.mock.calls[0][0].payload.optionId).toBe("yes");
  });
  it("retains configuration drafts across snapshots, tabs and closing", () => {
    const action = vi.fn();
    const configs = [agent("a"), agent("b")];
    const panel = new ConfigPanelComponent({
      container,
      configs,
      onAction: action,
      onClose: vi.fn(),
    });
    container.querySelector<HTMLInputElement>('input[name="command"]')!.value =
      "draft";
    panel.setConfigs(configs, "a");
    expect(
      container.querySelector<HTMLInputElement>('input[name="command"]')!.value,
    ).toBe("draft");
    container.querySelector<HTMLButtonElement>('[data-agent-id="b"]')!.click();
    container.querySelector<HTMLButtonElement>('[data-agent-id="a"]')!.click();
    expect(
      container.querySelector<HTMLInputElement>('input[name="command"]')!.value,
    ).toBe("draft");
    container.querySelector<HTMLButtonElement>(".drawer-close-btn")!.click();
    panel.setConfigs(configs, "a");
    container.querySelector<HTMLButtonElement>(".btn-save-config")!.click();
    expect(action.mock.calls[0][0].payload.config.command).toBe("draft");
  });
  it("refuses testing and saving unsupported websocket configuration", () => {
    const action = vi.fn();
    new ConfigPanelComponent({
      container,
      configs: [{ ...agent("a"), transport: "websocket" }],
      onAction: action,
      onClose: vi.fn(),
    });
    container.querySelector<HTMLButtonElement>(".btn-ping")!.click();
    container.querySelector<HTMLButtonElement>(".btn-save-config")!.click();
    expect(action).not.toHaveBeenCalled();
  });
  it("selection has no session creation and connect is explicit", () => {
    const action = vi.fn();
    const header = new HeaderComponent({ container, onAction: action });
    header.update({
      agentConfigs: [agent("a"), agent("b")],
      processStatuses: {},
      sessions: [],
      inputHistory: [],
    } as any);
    const select = container.querySelector<HTMLSelectElement>(
      ".header-agent-select",
    )!;
    select.value = "b";
    select.dispatchEvent(new Event("change"));
    expect(action).not.toHaveBeenCalled();
    container
      .querySelector<HTMLButtonElement>(".btn-agent-connection")!
      .click();
    expect(action).toHaveBeenCalledWith({
      type: "CONNECT_AGENT",
      payload: { agentId: "b" },
    });
  });
  it("defaults to history from all agents while connected", () => {
    new HistoryDrawerComponent({
      container,
      sessions: ["a", "b"].map((id) => ({
        id,
        agentId: id,
        title: id,
        updatedAt: Date.now(),
        messageCount: 0,
      })) as any,
      currentAgentId: "a",
      isAgentRunning: true,
      onAction: vi.fn(),
      onClose: vi.fn(),
    });
    expect(container.querySelectorAll(".history-session-item")).toHaveLength(2);
  });
});
