// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { ConfigDrawer } from "../../src/webview/components/drawers/config-drawer";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { ChatView } from "../../src/webview/components/chat/chat-view";
let root: HTMLElement, store: AppStore, send: ReturnType<typeof vi.fn>;
const config = { id: "a", name: "Agent A", command: "agent", args: [], env: {}, transport: "stdio", enabled: true };
const snapshot = { activeAgentId: "a", agentConfigs: [config], configRevisions: { a: 1 }, connections: [{ agentId: "a", generation: 1, status: "running", initialized: true, capabilities: { loadSession: true, promptCapabilities: { image: true } } }], activeSession: { id: "s", agentId: "a", title: "Current", status: "idle", messages: [], createdAt: 1, updatedAt: 1 } };
beforeEach(() => { root = document.createElement("div"); document.body.append(root); store = new AppStore(); send = vi.fn(); store.dispatch({ type: "APPLY_SNAPSHOT", payload: snapshot }); });
afterEach(() => { render(null, root); root.remove(); });
async function mount(node: any) { await act(() => render(<StoreProvider store={store}><ActionProvider onAction={send}>{node}</ActionProvider></StoreProvider>, root)); }
async function click(text: string) { await act(() => Array.from(root.querySelectorAll("button")).find(b => b.textContent?.trim() === text)!.click()); }
async function edit(label: string, value: string) { await act(() => { const el = root.querySelector(`[aria-label="${label}"]`) as HTMLInputElement; el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function result(type: string, payload: any) { await act(() => store.dispatch({ type, payload } as any)); }
it("shows a prompt-ready current Session empty state", async () => {
  await mount(<ChatView />); expect(root.textContent).toContain("Send a prompt"); expect(root.textContent).not.toContain("Connect an ACP Agent");
});
it("performs a reconnect only after successful disconnect acknowledgement", async () => {
  await mount(<HeaderBar />); await act(() => (root.querySelector('[aria-label="Connection information for Agent A"]') as HTMLButtonElement).click());
  expect(root.textContent).toContain("Client-offered capabilities"); await click("Reconnect / retry");
  const request = send.mock.calls.at(-1)![0]; expect(request.type).toBe("DISCONNECT_AGENT");
  await result("ACTION_RESULT", { requestId: request.payload.requestId, agentId: "a", success: true }); expect(send.mock.calls.at(-1)![0].type).toBe("CONNECT_AGENT");
});
it("preserves newer edits and advances baseline after an older save succeeds", async () => {
  await mount(<ConfigDrawer open onClose={() => {}} />); await edit("Agent Name", "First"); await click("Save"); const request = send.mock.calls.at(-1)![0]; await edit("Agent Name", "Newer");
  await result("AGENT_CONFIG_RESULT", { requestId: request.payload.requestId, configId: "a", operation: "save", success: true, configRevision: 2 });
  expect((root.querySelector('[aria-label="Agent Name"]') as HTMLInputElement).value).toBe("Newer"); await click("Save"); expect(send.mock.calls.at(-1)![0].payload.configRevision).toBe(2);
});
it("ignores a stale directory picker after the cwd field changes", async () => {
  await mount(<ConfigDrawer open onClose={() => {}} />); await click("Browse…"); const request = send.mock.calls.at(-1)![0]; await edit("Working Directory", "/newer");
  await result("AGENT_CONFIG_RESULT", { requestId: request.payload.requestId, configId: "a", operation: "directory", success: true, cwd: "/picked" }); expect((root.querySelector('[aria-label="Working Directory"]') as HTMLInputElement).value).toBe("/newer");
});
it("invalidates a test result when a clean config snapshot changes", async () => {
  await mount(<ConfigDrawer open onClose={() => {}} />); await click("Test Connection"); const request = send.mock.calls.at(-1)![0];
  await result("APPLY_SNAPSHOT", { ...snapshot, agentConfigs: [{ ...config, name: "External change" }], configRevisions: { a: 2 } });
  expect((root.querySelector('[aria-label="Agent Name"]') as HTMLInputElement).value).toBe("External change");
  await result("TEST_CONNECTION_RESULT", { requestId: request.payload.requestId, configId: "a", draftRevision: request.payload.draftRevision, success: true }); expect(root.textContent).not.toContain("Connection successful");
});
it("cancelled test fences late success without clearing edits", async () => {
  await mount(<ConfigDrawer open onClose={() => {}} />); await edit("Agent Name", "Unsaved"); await click("Test Connection"); const request = send.mock.calls.at(-1)![0]; await click("Cancel Test");
  expect(send.mock.calls.at(-1)![0].type).toBe("CANCEL_AGENT_TEST"); await result("TEST_CONNECTION_RESULT", { requestId: request.payload.requestId, configId: "a", success: true });
  expect(root.textContent).toContain("Test cancelled"); expect((root.querySelector('[aria-label="Agent Name"]') as HTMLInputElement).value).toBe("Unsaved");
});
