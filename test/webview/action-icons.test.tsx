// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { messageFixture } from "./user-message-fixture";
import { createCodeBlockHtml } from "../../src/webview/utils/markdown-code-block";
import { MarkdownBody } from "../../src/webview/components/chat/markdown-body";

it("copies code and gives icon feedback without restoring a text button", async () => {
  vi.useFakeTimers();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const root = document.createElement("div");
  document.body.append(root);
  cleanups.push(() => { act(() => render(null, root)); root.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
  act(() => render(<MarkdownBody content={'```ts\nconst size = 16;\n```'} />, root));
  const button = root.querySelector<HTMLButtonElement>('[data-action="copy-code"]')!;
  await act(async () => { button.click(); await Promise.resolve(); });
  expect(write).toHaveBeenCalledWith("const size = 16;");
  expectIcon(button, "Copied code");
  act(() => { vi.advanceTimersByTime(1500); });
  expectIcon(button, "Copy code");
});

it.each(["ts", "mermaid", "plantuml"])("keeps %s code utility actions named and icon-only", lang => {
  const root = document.createElement("div");
  root.innerHTML = createCodeBlockHtml(lang, "example");
  expectIcon(root.querySelector('[data-action="copy-code"]'), "Copy code");
  if (lang === "plantuml") expectIcon(root.querySelector("a"), "Open PlantUML SVG");
});

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

function expectIcon(control: Element | null, label: string) {
  expect(control, label).not.toBeNull();
  expect(control!.getAttribute("aria-label")).toBe(label);
  expect(control!.getAttribute("title")).toBeTruthy();
  expect(control!.textContent?.trim()).toBe("");
  const svg = control!.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg!.getAttribute("aria-hidden")).toBe("true");
  expect(svg!.getAttribute("focusable")).toBe("false");
}

function header(initialized = true) {
  const root = document.createElement("div");
  document.body.append(root);
  const store = new AppStore();
  const send = vi.fn();
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: {
    activeAgentId: "a", agentConfigs: [{ id: "a", name: "Agent A", command: "demo", args: [], env: {}, transport: "stdio", enabled: true }],
    connections: [{ agentId: "a", status: "running", initialized, generation: 3 }],
    activeSession: { id: "source", agentId: "a", title: "Original", status: "idle", attached: true, runtimeRevision: 5, createdAt: 1, updatedAt: 1, messages: [] },
    sessions: [], inputHistory: [], processStatuses: { a: "running" },
  } });
  act(() => render(<StoreProvider store={store}><ActionProvider onAction={send}><HeaderBar /></ActionProvider></StoreProvider>, root));
  cleanups.push(() => { act(() => render(null, root)); root.remove(); });
  return { root, send };
}

it("exposes named icon controls and keeps the new-session action contract", () => {
  const { root, send } = header();
  for (const label of ["Agent Settings", "Disconnect Agent A", "Connection information for Agent A", "New Chat Session", "Session History", "Close current Session", "View ACP Output Channel Logs"]) {
    expectIcon(root.querySelector(`[aria-label="${label}"]`), label);
  }
  expectIcon(root.querySelector(".connect-menu summary"), "Connect Agent");
  act(() => root.querySelector<HTMLButtonElement>('[data-action="new-session"]')!.click());
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: "CREATE_SESSION", payload: expect.objectContaining({ agentId: "a", generation: 3, requestId: expect.any(String) }),
  }));
});

it("keeps unavailable session icon actions disabled and silent", () => {
  const { root, send } = header(false);
  for (const action of ["new-session", "toggle-history"]) {
    const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    expect(button.disabled).toBe(true);
    act(() => button.click());
  }
  expect(send).not.toHaveBeenCalled();
});

it("names user and assistant icon actions without changing their placement", () => {
  const fixture = messageFixture();
  cleanups.push(fixture.unmount);
  expectIcon(fixture.button("copy", 0), "Copy prompt");
  expectIcon(fixture.button("rewind", 0), "Rewind / Undo");
  expectIcon(fixture.button("fork", 0), "Fork from here");
  expectIcon(fixture.container.querySelector(".assistant-message-actions .turn-action-btn"), "Copy all");
  expect(fixture.container.querySelector(".user-turn [data-action='fork-message']")).toBeNull();
  const assistant = fixture.container.querySelector(".assistant-turn")!;
  expect(assistant.lastElementChild?.classList.contains("assistant-message-actions")).toBe(true);
});
