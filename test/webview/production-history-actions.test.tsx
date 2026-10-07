// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act } from "preact/test-utils";
import { globalStore } from "../../src/webview/state/app-store";
import { snapshot } from "./preact-regression-fixtures";
import { connection, sessions, historyActionsFixture } from "./history-actions-fixture";

const app = historyActionsFixture();
const row = (id = "remote-existing") => app.root().querySelector<HTMLElement>(`[data-session-id="${id}"]`);
const button = (name: string) => app.root().querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;

describe("shipped compact history actions", () => {
  it("renders sibling controls, compact metadata and current-session status", async () => {
    await app.open();
    expect(row()?.querySelector(".session-item")?.classList.contains("card")).toBe(false);
    expect(row()?.querySelector(".session-title")?.getAttribute("title")).toBe("Past conversation");
    expect(row()?.querySelector(".session-cwd")?.getAttribute("title")).toBe(sessions[0].cwd);
    expect(row()?.querySelector(".session-item [aria-label='Copy Session ID']")).toBeNull();
    expect(row("s1")?.textContent).toContain("Current · idle");
    expect(row("missing-metadata")?.textContent).toContain("Untitled Session");
    expect(row("missing-metadata")?.textContent).toContain("Last activity not reported");
  });

  it("copies the exact ID without opening or deleting a Session", async () => {
    await app.open();
    await app.click('[data-session-id="remote-existing"] [aria-label="Copy Session ID"]');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("remote-existing");
    expect(app.root().textContent).toContain("Session ID copied");
    expect(app.actions.some((a) => a.type === "SWITCH_SESSION" || a.type === "DELETE_SESSION")).toBe(false);
  });

  it("retains the row and allows retry after a clipboard error", async () => {
    await app.open();
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Clipboard denied"));
    await app.click('[aria-label="Copy Session ID"]');
    expect(app.root().querySelector('[role="alert"]')?.textContent).toContain("Clipboard denied");
    expect(row()).not.toBeNull();
    await app.click('[aria-label="Copy Session ID"]');
    expect(app.root().textContent).toContain("Session ID copied");
  });

  it("searches ID and cwd even when a different title is present", async () => {
    await app.open();
    await app.search("REMOTE-EXISTING");
    expect(row()).not.toBeNull();
    expect(row("s1")).toBeNull();
    await app.search("LONG/DIRECTORY");
    expect(row()).not.toBeNull();
    await app.search("current CONVERSATION");
    expect(row("s1")).not.toBeNull();
  });

  it("cancels inline confirmation without any lifecycle action", async () => {
    await app.open();
    await app.click('[aria-label="Delete Session"]');
    expect(app.root().textContent).toContain("Permanently delete");
    expect(app.root().textContent).toContain("Past conversation");
    await app.click('[aria-label="Cancel delete Session"]');
    expect(app.root().querySelector('[aria-label="Confirm delete Session"]')).toBeNull();
    expect(app.actions.some((a) => a.type === "DELETE_SESSION" || a.type === "SWITCH_SESSION")).toBe(false);
  });

  it("qualifies delete, fences repeated clicks and locks only its Agent", async () => {
    await app.open();
    const request = await app.beginDelete();
    expect(request.payload).toMatchObject({ agentId: "a1", sessionId: "remote-existing", generation: 1 });
    expect(request.payload.requestId).toEqual(expect.any(String));
    expect(globalStore.getState().agent.lifecyclePending?.a1).toBe(request.payload.requestId);
    expect(globalStore.getState().agent.lifecyclePending?.a2).toBeUndefined();
    expect(button("Copy Session ID").disabled).toBe(false);
    expect(button("Delete Session").disabled).toBe(true);
    await app.click('[aria-label="Confirm delete Session"]');
    expect(app.actions.filter((a) => a.type === "DELETE_SESSION")).toHaveLength(1);
    expect(app.actions.some((a) => a.type === "SWITCH_SESSION")).toBe(false);
  });

  it("ignores unrelated receipts and stale success", async () => {
    await app.open();
    const request = await app.beginDelete();
    await app.receipt(true, { requestId: "unrelated" });
    await app.receipt(true, { agentId: "a2" });
    await app.receipt(true, { generation: 0 });
    expect(globalStore.getState().agent.lifecyclePending?.a1).toBe(request.payload.requestId);
    expect(row()).not.toBeNull();
    expect(button("Delete Session").disabled).toBe(true);
    expect(app.actions.filter((a) => a.type === "REQUEST_AGENT_HISTORY")).toHaveLength(1);
    // A fresh matching result must still be able to settle the local operation.
    await app.receipt(false, { requestId: request.payload.requestId });
    expect(button("Delete Session").disabled).toBe(false);
  });

  it("retains the row/current runtime on failure and permits explicit retry", async () => {
    await app.open();
    await app.beginDelete();
    await app.receipt(false);
    expect(row()).not.toBeNull();
    expect(globalStore.getState().session.activeSession?.id).toBe("s1");
    expect(app.root().querySelector('[role="alert"]')?.textContent).toContain("Delete refused");
    expect(globalStore.getState().agent.lifecyclePending?.a1).toBeUndefined();
    await app.beginDelete();
    expect(app.actions.filter((a) => a.type === "DELETE_SESSION")).toHaveLength(2);
  });

  it("removes only after success, refreshes without cursor and retains query", async () => {
    await app.open();
    await app.search("remote");
    await app.beginDelete();
    expect(row()).not.toBeNull();
    await app.receipt(true);
    expect(row()).toBeNull();
    expect(app.root().querySelector(".history-drawer")).not.toBeNull();
    expect(app.root().querySelector<HTMLInputElement>('[aria-label="Search Agent history"]')?.value).toBe("remote");
    expect(app.last("REQUEST_AGENT_HISTORY").payload.cursor).toBeUndefined();
    await app.host("AGENT_HISTORY_RESULT", {
      ...app.last("REQUEST_AGENT_HISTORY").payload,
      generation: 1,
      sessions: [],
      error: "Refresh unavailable",
    });
    expect(app.root().textContent).toContain("Refresh unavailable");
    expect(app.root().textContent).not.toContain("Unable to delete");
    expect(globalStore.getState().session.activeSession?.id).toBe("s1");
  });

  it("invalidates pre-delete list requests so late pages cannot restore deleted rows", async () => {
    await app.open();
    const stale = app.last("REQUEST_AGENT_HISTORY");
    await app.beginDelete();
    await app.receipt(true);
    await app.list(sessions.slice(1));
    await app.host("AGENT_HISTORY_RESULT", { ...stale.payload, generation: 1, sessions });
    expect(row()).toBeNull();
  });

  it("discards an opaque pagination cursor after deletion and refreshes page one", async () => {
    await app.open();
    await app.list(sessions, "opaque-next");
    const more = Array.from(app.root().querySelectorAll("button")).find((b) => b.textContent === "Load more")!;
    await act(() => more.click());
    expect(app.last("REQUEST_AGENT_HISTORY").payload.cursor).toBe("opaque-next");
    await app.list([{ id: "page-two", title: "Second page" }]);
    expect(row("page-two")).not.toBeNull();
    await app.beginDelete();
    await app.receipt(true);
    expect(app.last("REQUEST_AGENT_HISTORY").payload.cursor).toBeUndefined();
    expect(Array.from(app.root().querySelectorAll("button")).some((b) => b.textContent === "Load more")).toBe(false);
  });

  it("blocks delete while streaming but leaves copy available", async () => {
    await app.open({ ...snapshot("s1", "streaming") });
    expect(button("Delete Session").disabled).toBe(true);
    expect(button("Copy Session ID").disabled).toBe(false);
    expect(row()?.querySelector<HTMLButtonElement>(".session-item")?.disabled).toBe(true);
  });

  it("explains unsupported deletion and still allows copying", async () => {
    await app.open({ connections: [{ ...connection, capabilities: { sessionCapabilities: { list: {} } } }] });
    expect(button("Delete Session").disabled).toBe(true);
    expect(button("Delete Session").title).toMatch(/does not advertise.*delet/i);
    await app.click('[aria-label="Copy Session ID"]');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("remote-existing");
  });

  it("retires its obsolete lock on generation replacement without deleting a row", async () => {
    await app.open();
    const request = await app.beginDelete();
    await app.host("STATE_SNAPSHOT", {
      ...snapshot(),
      connections: [{ ...connection, generation: 2 }],
      activeAgentId: "a1",
    });
    expect(globalStore.getState().agent.lifecyclePending?.a1).toBeUndefined();
    const refresh = app.last("REQUEST_AGENT_HISTORY");
    await app.host("AGENT_HISTORY_RESULT", { ...refresh.payload, generation: 2, sessions });
    await app.host("ACTION_RESULT", { ...request.payload, action: "DELETE_SESSION", success: true });
    expect(row()).not.toBeNull();
  });

  it("keeps shared pending across close/reopen but ignores the old drawer's receipt", async () => {
    await app.open();
    const request = await app.beginDelete();
    await app.click('[aria-label="Close History"]');
    expect(globalStore.getState().agent.lifecyclePending?.a1).toBe(request.payload.requestId);
    await app.click('[title="Session History"]');
    await app.list();
    expect(button("Delete Session").disabled).toBe(true);
    await app.receipt(true);
    expect(row()).not.toBeNull();
    expect(button("Delete Session").disabled).toBe(false);
  });

  it("deleting current Session follows the host snapshot without closing history", async () => {
    await app.open();
    await app.beginDelete("s1");
    await app.host("STATE_SNAPSHOT", {
      ...snapshot(),
      activeSession: undefined,
      connections: [connection],
      activeAgentId: "a1",
    });
    await app.receipt(true);
    expect(row("s1")).toBeNull();
    expect(app.root().querySelector(".history-drawer")).not.toBeNull();
    expect(app.actions.some((a) => a.type === "SWITCH_SESSION")).toBe(false);
  });

  it("keeps a later Agent's history intact after the original delete completes", async () => {
    await app.open();
    const request = await app.beginDelete();
    await act(() => globalStore.dispatch({ type: "SELECT_AGENT", payload: "a2" }));
    await app.host("STATE_SNAPSHOT", {
      ...snapshot(),
      activeAgentId: "a2",
      connections: [connection, { ...connection, agentId: "a2" }],
    });
    await app.host("AGENT_HISTORY_RESULT", { ...app.last("REQUEST_AGENT_HISTORY").payload, generation: 1, sessions });
    await app.host("ACTION_RESULT", { ...request.payload, action: "DELETE_SESSION", success: true });
    expect(row()).not.toBeNull();
  });
});
