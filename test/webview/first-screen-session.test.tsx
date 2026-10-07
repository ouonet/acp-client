// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { App } from "../../src/webview/components/app";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";

let root: HTMLElement, store: AppStore, send: ReturnType<typeof vi.fn>;
const config = (id: string, extra: Record<string, unknown> = {}) => (
  { id, name: id, command: "agent", args: [], transport: "stdio", enabled: true, ...extra }
);
const connection = (agentId: string, generation: number) => (
  { agentId, generation, status: "running", initialized: true }
);
const session = (agentId: string, extra: Record<string, unknown> = {}) => (
  { id: "s", agentId, title: "Current", status: "idle", messages: [], createdAt: 1, updatedAt: 1, ...extra }
);

beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  store = new AppStore();
  send = vi.fn();
});
afterEach(() => { render(null, root); root.remove(); });

async function mount() {
  await act(() => render(
    <StoreProvider store={store}><ActionProvider onAction={send}><App onAction={send} /></ActionProvider></StoreProvider>,
    root,
  ));
}
async function apply(payload: Record<string, unknown>) {
  await act(() => store.dispatch({ type: "APPLY_SNAPSHOT", payload }));
}
function button(label: string) {
  return Array.from(root.querySelectorAll("button")).find((item) => item.textContent?.trim() === label) as HTMLButtonElement | undefined;
}
async function click(label: string) {
  await act(() => button(label)!.click());
}
async function escape() {
  const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
  await act(() => { dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
}
function sent() { return send.mock.calls.map((call) => call[0]); }

it("stays quiet before the first snapshot", async () => {
  await mount();
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  expect(root.querySelector(".btn-welcome-connect")).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it("opens agent creation when no configuration is loaded", async () => {
  await mount();
  await apply({ agentConfigs: [], connections: [] });
  expect(root.querySelector('[role="dialog"]')?.textContent).toContain("Agent Configurations");
  expect(root.querySelector(".welcome-title")?.textContent).toBe("Create an Agent");
  expect(root.querySelector(".welcome-subtitle")?.textContent).toBe("Add an Agent configuration to begin.");
  expect(root.querySelector(".welcome-agent-select")).toBeNull();
  expect(root.querySelector(".input-dock")).toBeNull();
  expect(send).not.toHaveBeenCalled();
  await escape();
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  await click("Create Agent");
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it("keeps an open configuration drawer when the first agent arrives", async () => {
  await mount();
  await apply({ agentConfigs: [], connections: [] });
  await apply({ agentConfigs: [config("a")], connections: [], activeAgentId: "a" });
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  expect(root.querySelector(".welcome-title")?.textContent).toBe("Connect an ACP Agent");
});

it("connects a configured agent without creating a session", async () => {
  await mount();
  await apply({ agentConfigs: [], connections: [] });
  await escape();
  await apply({ agentConfigs: [config("a")], connections: [], activeAgentId: "a" });
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  expect(root.querySelector(".welcome-subtitle")?.textContent).toBe("Select an Agent from your configurations to establish an interactive pair-programming session.");
  expect(root.querySelectorAll(".welcome-agent-select option")).toHaveLength(1);
  await click("Connect Agent");
  expect(sent()).toEqual([expect.objectContaining({
    type: "CONNECT_AGENT",
    payload: expect.objectContaining({ agentId: "a", requestId: expect.any(String) }),
  })]);
  expect(sent()[0].payload.generation).toBeUndefined();
  expect(sent()[0].payload.requestId.length).toBeGreaterThan(0);
});

it("lists every configuration and keeps selection local", async () => {
  await mount();
  await apply({ agentConfigs: [config("a", { name: "Alpha" }), config("b", { name: "" })], connections: [], activeAgentId: "a" });
  const labels = Array.from(root.querySelectorAll(".welcome-agent-select option")).map((option) => option.textContent);
  expect(labels).toEqual(["Alpha", "b"]);
  const select = root.querySelector(".welcome-agent-select") as HTMLSelectElement;
  await act(() => {
    select.value = "b";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(send).not.toHaveBeenCalled();
  expect(store.getState().agent.selectedAgentId).toBe("b");
});

it("offers connect when the only agent is disabled", async () => {
  await mount();
  await apply({ agentConfigs: [config("a", { enabled: false })], connections: [], activeAgentId: "a" });
  expect(root.querySelector(".welcome-title")?.textContent).toBe("Connect an ACP Agent");
  expect(root.textContent).not.toContain("Create an Agent");
});

it("starts one session when the selected agent is initialized", async () => {
  await mount();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 2)], activeAgentId: "a" });
  expect(root.querySelector(".input-dock")).toBeNull();
  expect(root.querySelector(".welcome-title")?.textContent).toBe("Create a Session");
  expect(root.querySelector(".welcome-subtitle")?.textContent).toBe("Start a new Session or load one from Agent history.");
  expect(sent()).toHaveLength(1);
  expect(sent()[0]).toMatchObject({ type: "CREATE_SESSION", payload: { agentId: "a", generation: 2 } });
  expect(sent()[0].payload.requestId.length).toBeGreaterThan(0);
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 2)], activeAgentId: "a" });
  expect(sent()).toHaveLength(1);
  const requestId = sent()[0].payload.requestId;
  await act(() => store.dispatch({ type: "ACTION_RESULT", payload: { requestId, agentId: "a", success: false, error: "Cannot create" } }));
  expect(sent()).toHaveLength(1);
  await click("New Session");
  expect(sent()).toHaveLength(2);
  expect(sent()[1].type).toBe("CREATE_SESSION");
});

it("waits until a pending lifecycle request settles", async () => {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: { agentConfigs: [config("a")], connections: [connection("a", 1)], activeAgentId: "a" } });
  store.dispatch({ type: "LIFECYCLE_STARTED", payload: { agentId: "a", requestId: "req-1" } });
  await mount();
  expect(send).not.toHaveBeenCalled();
  await act(() => store.dispatch({ type: "ACTION_RESULT", payload: { requestId: "req-1", agentId: "a", success: false } }));
  expect(sent()).toHaveLength(1);
  expect(sent()[0].type).toBe("CREATE_SESSION");
});

it("does not create while another agent owns the session", async () => {
  await mount();
  await apply({
    agentConfigs: [config("a"), config("b")], activeAgentId: "a",
    connections: [connection("a", 1), connection("b", 1)],
    activeSession: session("b", { title: "Other" }),
  });
  expect(send).not.toHaveBeenCalled();
  await apply({
    agentConfigs: [config("a"), config("b")], activeAgentId: "a",
    connections: [connection("a", 1), connection("b", 1)],
  });
  expect(sent()).toEqual([expect.objectContaining({ type: "CREATE_SESSION", payload: expect.objectContaining({ agentId: "a", generation: 1 }) })]);
});

it("creates again only after the bound session is gone and the generation changes", async () => {
  await mount();
  const current = session("a");
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 2)], activeAgentId: "a", activeSession: current });
  expect(send).not.toHaveBeenCalled();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 3)], activeAgentId: "a", activeSession: current });
  expect(send).not.toHaveBeenCalled();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 3)], activeAgentId: "a" });
  expect(sent()).toEqual([expect.objectContaining({ type: "CREATE_SESSION", payload: expect.objectContaining({ agentId: "a", generation: 3 }) })]);
});

it("hides the composer after the current session closes", async () => {
  await mount();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 2)], activeAgentId: "a", activeSession: session("a") });
  expect(root.querySelector(".input-dock")).not.toBeNull();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 2)], activeAgentId: "a" });
  expect(send).not.toHaveBeenCalled();
  expect(root.querySelector(".input-dock")).toBeNull();
});

it("keeps the composer when the session is detached", async () => {
  await mount();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 1)], activeAgentId: "a", activeSession: session("a", { attached: false }) });
  expect(root.querySelector(".input-dock")).not.toBeNull();
  expect(root.querySelector(".welcome-subtitle")?.textContent).toBe("Reconnect the Agent or create a new Session to continue.");
  expect(send).not.toHaveBeenCalled();
});

it("uses Current Session when the title is empty", async () => {
  await mount();
  await apply({ agentConfigs: [config("a")], connections: [connection("a", 1)], activeAgentId: "a", activeSession: session("a", { title: "" }) });
  expect(root.querySelector(".welcome-title")?.textContent).toBe("Current Session");
});

it("shows the session and the drawer when no configurations remain", async () => {
  await mount();
  await apply({ agentConfigs: [], connections: [], activeSession: session("a", { title: "Kept" }) });
  expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  expect(root.querySelector(".welcome-title")?.textContent).toBe("Kept");
  expect(root.querySelector(".input-dock")).not.toBeNull();
  expect(button("Create Agent")).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});

it("opens the drawer again when every configuration is removed", async () => {
  await mount();
  await apply({ agentConfigs: [config("a")], connections: [], activeAgentId: "a" });
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  await apply({ agentConfigs: [], connections: [] });
  expect(root.querySelector('[role="dialog"]')?.textContent).toContain("Agent Configurations");
});
