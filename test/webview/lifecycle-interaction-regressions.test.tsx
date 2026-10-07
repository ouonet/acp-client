// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { App } from "../../src/webview/components/app";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { HistoryDrawer } from "../../src/webview/components/drawers/history-drawer";

let root: HTMLElement, store: AppStore, send: ReturnType<typeof vi.fn>;
const config = (id: string) => ({ id, name: id, command: "agent", args: [], transport: "stdio", enabled: true });
const snapshot = {
  activeAgentId: "a", agentConfigs: [config("a"), config("b")],
  connections: [{ agentId: "a", generation: 1, status: "running", initialized: true, capabilities: { sessionCapabilities: { list: {}, load: {} } } }],
  activeSession: { id: "s", agentId: "a", title: "Current", status: "idle", messages: [], createdAt: 1, updatedAt: 1 },
};
beforeEach(() => {
  root = document.createElement("div"); document.body.append(root); store = new AppStore(); send = vi.fn();
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: snapshot });
});
afterEach(() => { render(null, root); root.remove(); });
async function mount(node: any) {
  await act(() => render(<StoreProvider store={store}><ActionProvider onAction={send}>{node}</ActionProvider></StoreProvider>, root));
}
async function click(selector: string) { await act(() => (root.querySelector(selector) as HTMLElement).click()); }
async function result(payload: any) { await act(() => store.dispatch({ type: "ACTION_RESULT", payload } as any)); }
function installTabMetrics(scrollWidth: number, clientWidth: number) {
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
  const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const read = (property: PropertyDescriptor | undefined, element: HTMLElement) =>
    typeof property?.get === "function" ? property.get.call(element) : 0;
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get() { return this.classList?.contains("agent-tabs") ? scrollWidth : read(scroll, this); },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() { return this.classList?.contains("agent-tabs") ? clientWidth : read(client, this); },
  });
  return () => {
    if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollWidth", scroll);
    if (client) Object.defineProperty(HTMLElement.prototype, "clientWidth", client);
  };
}
const connection = (agentId: string) => ({ ...snapshot.connections[0], agentId });

it("covers the app with configuration and keeps keyboard focus inside the modal", async () => {
  await mount(<App onAction={send} />);
  const trigger = root.querySelector('[aria-label="Agent Settings"]') as HTMLButtonElement;
  trigger.focus(); await click('[aria-label="Agent Settings"]');
  const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
  expect(dialog.closest(".main-content")).toBeNull();
  for (const selector of [".acp-header", ".main-content", ".input-dock"]) {
    expect(root.querySelector(selector)?.hasAttribute("inert")).toBe(true);
  }
  const first = dialog.querySelector("button") as HTMLButtonElement;
  const last = Array.from(dialog.querySelectorAll("button")).at(-1)!;
  last.focus(); await act(() => { last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
  expect(document.activeElement).toBe(first);
  await act(() => { first.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(root.querySelector(".input-dock")?.hasAttribute("inert")).toBe(false);
});

it("renders connection information outside the header stacking context", async () => {
  await mount(<HeaderBar />); await click('[aria-label="Connection information for a"]');
  expect(root.querySelector('[role="dialog"]')?.closest("header")).toBeNull();
});

it("hides overflow and connection information when no Agent is connected", async () => {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { agentConfigs: [], connections: [] } });
  await mount(<HeaderBar />);
  expect(root.querySelector(".agent-overflow")).toBeNull();
  expect(root.querySelector('[aria-label^="Connection information for"]')).toBeNull();
});

it("keeps one wide Agent on the tab row and shows its connection information on the Session row", async () => {
  const restore = installTabMetrics(400, 100);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector(".agent-overflow")).toBeNull();
    expect(root.querySelector(".tab-info")).toBeNull();
    const info = root.querySelectorAll('[aria-label="Connection information for a"]');
    expect(info).toHaveLength(1);
    expect(info[0].closest(".session-header")).not.toBeNull();
    expect(info[0].closest(".agent-tab-group")).toBeNull();
    expect(root.querySelector('.agent-tab-group [aria-label="Disconnect a"]')).not.toBeNull();
    expect(root.querySelector(".connect-menu")).not.toBeNull();
    expect(root.querySelector('[aria-label="Agent Settings"]')).not.toBeNull();
  } finally {
    restore();
  }
});

it("hides overflow when multiple connected Agents fit", async () => {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snapshot, connections: [connection("a"), connection("b")] } });
  const restore = installTabMetrics(100, 100);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector(".agent-overflow")).toBeNull();
    expect(root.querySelector('[aria-label="Connection information for a"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="Connection information for b"]')).toBeNull();
  } finally {
    restore();
  }
});

it("lists each overflowing Agent once and selects it", async () => {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snapshot, connections: [connection("a"), connection("b")] } });
  const restore = installTabMetrics(200, 100);
  try {
    await mount(<HeaderBar />);
    const menu = root.querySelector(".agent-overflow") as HTMLDetailsElement;
    expect(menu.querySelector("summary")?.textContent).toBe("");
    expect(menu.querySelector("summary svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(menu.querySelector("summary")?.getAttribute("aria-label")).toBe("Agent overflow");
    const labels = Array.from(menu.querySelectorAll(".menu-content button")).map(button => button.textContent);
    expect(labels).toEqual(["a · running", "b · running"]);
    await act(() => { (menu.querySelectorAll(".menu-content button")[1] as HTMLButtonElement).click(); });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "SELECT_AGENT",
      payload: expect.objectContaining({ agentId: "b" }),
    }));
  } finally {
    restore();
  }
});

it("keeps the opened connection dialog when the selected Agent is cleared", async () => {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snapshot, connections: [connection("a"), connection("b")] } });
  await mount(<HeaderBar />);
  await act(() => store.dispatch({ type: "SELECT_AGENT", payload: "b" }));
  const info = root.querySelector('[aria-label="Connection information for b"]') as HTMLButtonElement;
  expect(info.closest(".session-header")).not.toBeNull();
  await act(() => info.click());
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  await act(() => store.dispatch({ type: "SELECT_AGENT", payload: "" }));
  expect(root.querySelector('.session-header [aria-label^="Connection information for"]')).toBeNull();
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
});

it("measures overflow after the connected set changes when ResizeObserver is missing", async () => {
  const observer = globalThis.ResizeObserver;
  Reflect.deleteProperty(globalThis, "ResizeObserver");
  const fitting = installTabMetrics(100, 100);
  try {
    await mount(<HeaderBar />);
    expect(root.querySelector(".agent-overflow")).toBeNull();
    fitting();
    const overflowing = installTabMetrics(200, 100);
    try {
      await act(() => store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snapshot, connections: [connection("a"), connection("b")] } }));
      expect(root.querySelector(".agent-overflow")).not.toBeNull();
    } finally {
      overflowing();
    }
  } finally {
    if (observer) globalThis.ResizeObserver = observer;
  }
});

it("dismisses header menus on selection, Escape and outside interaction", async () => {
  await mount(<HeaderBar />);
  const menu = root.querySelector(".connect-menu") as HTMLDetailsElement;
  menu.open = true; await click(".connect-menu .menu-content button"); expect(menu.open).toBe(false);
  menu.open = true;
  await act(() => { menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(menu.open).toBe(false);
  menu.open = true; await act(() => { document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(menu.open).toBe(false);
});

it("prevents duplicate lifecycle requests until their own acknowledgement", async () => {
  await mount(<HeaderBar />); const button = root.querySelector('[data-action="new-session"]') as HTMLButtonElement;
  await act(() => { button.click(); button.click(); });
  expect(send).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
  const request = send.mock.calls[0][0];
  await result({ requestId: "other", agentId: "a", success: true }); expect(button.disabled).toBe(true);
  await result({ requestId: request.payload.requestId, agentId: "a", success: false, error: "Cannot create" });
  expect(button.disabled).toBe(false); expect(root.textContent).toContain("Cannot create");
  await click('[data-action="new-session"]'); expect(send).toHaveBeenCalledTimes(2);
});

it("blocks sending to the old Session while New is awaiting acknowledgement", async () => {
  store.dispatch({ type: "SET_DRAFT", payload: "Keep this draft" });
  await mount(<App onAction={send} />); await click('[data-action="new-session"]');
  const request = send.mock.calls.at(-1)![0];
  expect((root.querySelector('[aria-label="User prompt input"]') as HTMLTextAreaElement).disabled).toBe(true);
  await click('[title="Send Prompt (Enter)"]'); expect(send).toHaveBeenCalledTimes(1);
  await act(() => store.dispatch({ type: "APPLY_SNAPSHOT", payload: snapshot }));
  expect((root.querySelector('[title="Send Prompt (Enter)"]') as HTMLButtonElement).disabled).toBe(true);
  await result({ requestId: request.payload.requestId, agentId: "a", success: false, error: "Cannot replace" });
  expect((root.querySelector('[aria-label="User prompt input"]') as HTMLTextAreaElement).disabled).toBe(false);
  expect(store.getState().input.draft).toBe("Keep this draft");
});

it("settles acknowledgements for independent Agents even when results arrive together", async () => {
  await mount(<HeaderBar />); await click('[data-action="new-session"]');
  const first = send.mock.calls.at(-1)![0];
  await act(() => store.dispatch({ type: "APPLY_SNAPSHOT", payload: {
    ...snapshot, activeAgentId: "b", activeSession: { ...snapshot.activeSession, agentId: "b" },
    connections: [...snapshot.connections, { ...snapshot.connections[0], agentId: "b" }],
  } }));
  await click('[data-action="new-session"]'); const second = send.mock.calls.at(-1)![0];
  await act(() => {
    store.dispatch({ type: "ACTION_RESULT", payload: { requestId: first.payload.requestId, agentId: "a", success: true } });
    store.dispatch({ type: "ACTION_RESULT", payload: { requestId: second.payload.requestId, agentId: "b", success: true } });
  });
  expect(store.getState().agent.lifecyclePending).toEqual({});
  await click('[data-action="new-session"]'); expect(send).toHaveBeenCalledTimes(3);
});

it("offers configuration when every Agent is disabled", async () => {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snapshot, agentConfigs: [{ ...config("a"), enabled: false }] } });
  await mount(<HeaderBar />); expect(root.querySelector(".connect-menu")?.textContent).toContain("Configure Agent");
});

it("retains history and reports load failure until a successful load", async () => {
  const close = vi.fn(); await mount(<HistoryDrawer open onClose={close} />);
  const request = send.mock.calls.find(c => c[0].type === "REQUEST_AGENT_HISTORY")![0];
  await act(() => store.dispatch({ type: "AGENT_HISTORY_RESULT", payload: { agentId: "a", requestId: request.payload.requestId, sessions: [{ id: "remote", title: "Remote" }] } } as any));
  await click(".session-item"); const load = send.mock.calls.at(-1)![0];
  expect(close).not.toHaveBeenCalled(); expect((root.querySelector(".session-item") as HTMLButtonElement).disabled).toBe(true);
  await result({ requestId: load.payload.requestId, agentId: "a", success: false, error: "Agent refused load" });
  expect(close).not.toHaveBeenCalled(); expect(root.textContent).toContain("Agent refused load");
  await click(".session-item"); const retry = send.mock.calls.at(-1)![0];
  await result({ requestId: retry.payload.requestId, agentId: "a", success: true }); expect(close).toHaveBeenCalledOnce();
});
