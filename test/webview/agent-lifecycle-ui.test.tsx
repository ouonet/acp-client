// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { ConfigDrawer } from "../../src/webview/components/drawers/config-drawer";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { HistoryDrawer } from "../../src/webview/components/drawers/history-drawer";
let root: HTMLElement, store: AppStore, send: ReturnType<typeof vi.fn>;
const config = (id: string) => ({ id, name: id, command: "agent", args: ["--stdio"], transport: "stdio", enabled: true });
const session = (agentId: string) => ({ id: "same", agentId, title: agentId, status: "idle", messages: [], createdAt: 1, updatedAt: 1 });
const snap = (agentId = "a") => ({ activeAgentId: agentId, activeSession: session(agentId), agentConfigs: [config("a"), config("b")], connections: [{ agentId: "a", status: "running", initialized: true, generation: 1, capabilities: { sessionCapabilities: { list: {}, load: {} } } }, { agentId: "b", status: "running", initialized: true, generation: 1 }], sessions: [session("a"), { ...session("b"), status: "waiting_approval" }], configRevisions: { a: 1, b: 1 } });
beforeEach(() => { root = document.createElement("div"); document.body.append(root); store = new AppStore(); send = vi.fn(); });
afterEach(() => { render(null, root); root.remove(); });
async function mount(node: any) { await act(() => render(<StoreProvider store={store}><ActionProvider onAction={send}>{node}</ActionProvider></StoreProvider>, root)); }
async function input(label: string, value: string) { const el = root.querySelector(`[aria-label="${label}"]`) as HTMLInputElement; expect(el).not.toBeNull(); await act(() => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function click(text: string) { const el = Array.from(root.querySelectorAll("button")).find(b => b.textContent?.trim() === text); expect(el).toBeDefined(); await act(() => el!.click()); }
describe("Agent lifecycle Preact", () => {
  it("renders connected Agent tabs and one current Session row with background approval", async () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap() }); await mount(<HeaderBar />);
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("a"); expect(root.textContent).toContain("Approval");
    await act(() => (root.querySelector('[role="tab"][data-agent-id="b"]') as HTMLButtonElement).click());
    expect(send).toHaveBeenCalledWith({ type: "SELECT_AGENT", payload: { agentId: "b" } }); expect(root.querySelector(".session-header")).not.toBeNull();
  });
  it("preserves qualified drafts and attachments across same-ID Agent sessions", () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap("a") }); store.dispatch({ type: "SET_DRAFT", payload: "draft a" });
    store.dispatch({ type: "ADD_ATTACHMENT", payload: { id: "img", type: "image", mimeType: "image/png", data: "a" } });
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap("b") }); expect(store.getState().input.draft).toBe("");
    store.dispatch({ type: "SET_DRAFT", payload: "draft b" }); store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap("a") });
    expect(store.getState().input.draft).toBe("draft a"); expect(store.getState().input.attachments).toHaveLength(1);
  });
  it("migrates a pending first prompt draft to its newly created Session", () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snap(), activeSession: undefined } });
    store.dispatch({ type: "SET_DRAFT", payload: "First prompt" });
    store.dispatch({ type: "PROMPT_STARTED", payload: { requestId: "first", sessionId: "" } });
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap() });
    store.dispatch({ type: "PROMPT_RESULT", payload: { requestId: "first", sessionId: "same", status: "rejected", error: "Failed" } } as any);
    expect(store.getState().input.draft).toBe("First prompt"); expect(store.getState().input.submitError).toBe("Failed");
  });
  it("ignores older snapshots", () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snap("b"), revision: 2 } }); store.dispatch({ type: "APPLY_SNAPSHOT", payload: { ...snap("a"), revision: 1 } });
    expect(store.getState().session.activeSession?.agentId).toBe("b");
  });
  it("loads requested Agent history without treating remote records as idle", async () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap() }); await mount(<HistoryDrawer open onClose={() => {}} />);
    const request = send.mock.calls.find(c => c[0].type === "REQUEST_AGENT_HISTORY")?.[0]; expect(request).toBeDefined();
    await act(() => store.dispatch({ type: "AGENT_HISTORY_RESULT", payload: { agentId: "a", requestId: request.payload.requestId, sessions: [{ id: "remote", title: "Remote title", updatedAt: 1 }], nextCursor: "next" } } as any));
    expect(root.textContent).toContain("Remote title"); expect(root.textContent).not.toContain("idle"); expect(root.textContent).toContain("Load more");
  });
  it("accepts an asynchronous first config snapshot and exposes all fields", async () => {
    await mount(<ConfigDrawer open onClose={() => {}} />); await act(() => store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap() }));
    expect((root.querySelector('[aria-label="Agent Name"]') as HTMLInputElement)?.value).toBe("a");
    for (const label of ["Execution Command", "Arguments", "Working Directory", "Enabled"]) expect(root.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
  });
  it("creates one stable draft and validates before save", async () => {
    await mount(<ConfigDrawer open onClose={() => {}} />); await click("Add Agent"); await click("Save"); expect(send).not.toHaveBeenCalled(); expect(root.textContent).toContain("required");
    await input("Agent Name", "New Agent"); await input("Execution Command", "agent"); await input("Arguments", '--label "hello world"'); await click("Save");
    const first = send.mock.calls.at(-1)![0]; expect(first.payload.config.args).toEqual(["--label", "hello world"]); expect(first.payload.requestId).toBeTruthy();
  });
  it("preserves dirty config fields across snapshots and displays originating save failure", async () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap() }); await mount(<ConfigDrawer open onClose={() => {}} />);
    await input("Agent Name", "Dirty"); await click("Save"); const req = send.mock.calls.at(-1)![0]; await act(() => store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap() }));
    expect((root.querySelector('[aria-label="Agent Name"]') as HTMLInputElement).value).toBe("Dirty");
    await act(() => store.dispatch({ type: "AGENT_CONFIG_RESULT", payload: { requestId: req.payload.requestId, configId: "a", operation: "save", success: false, error: "Disk full" } } as any));
    expect(root.textContent).toContain("Disk full"); expect((root.querySelector('[aria-label="Delete Agent"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
