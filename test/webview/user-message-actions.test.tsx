// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { messageFixture } from "./user-message-fixture";
import { inputReducer, initialInputState } from "../../src/webview/state/input-slice";

let fixture: ReturnType<typeof messageFixture>;
afterEach(() => { fixture?.unmount(); vi.restoreAllMocks(); vi.useRealTimers(); });
const mount = (overrides: Parameters<typeof messageFixture>[0] = {}) => (fixture = messageFixture(overrides));

describe("focus-triggered user message toolbar", () => {
  it("gives users only Copy/Rewind and places Fork after each assistant response", () => {
    const h = mount();
    expect(h.container.querySelector(".user-badge")).toBeNull();
    expect(h.container.querySelectorAll(".user-turn .message-toolbar")).toHaveLength(2);
    expect(h.container.querySelector(".user-turn [data-action='fork-message']")).toBeNull();
    expect(h.container.querySelectorAll(".user-turn .message-toolbar button")).toHaveLength(4);
    expect(h.container.querySelector(".assistant-turn .turn-header [title='Fork from here']")).toBeNull();
    expect(h.container.querySelectorAll(".assistant-content + .assistant-message-actions [data-action='fork-message']")).toHaveLength(2);
    expect((h.container.querySelector(".user-turn") as HTMLElement).tabIndex).toBe(0);
    expect(h.button("copy")).not.toBeNull(); expect(h.button("rewind")).not.toBeNull(); expect(h.button("fork")).not.toBeNull();
  });
  it("copies the original prompt with its line breaks", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const h = mount(); h.click("copy");
    expect(writeText).toHaveBeenCalledWith("Second\nline"); expect(h.send).not.toHaveBeenCalled();
  });
  it("forks through an assistant response, excludes later turns and leaves its child input empty", () => {
    const h = mount(); const original = structuredClone(h.source); h.click("fork", 0);
    expect(h.send).toHaveBeenCalledWith({ type: "FORK_SESSION", payload: { sourceSessionId: "source", agentId: "a", generation: 3, runtimeRevision: 5, requestId: expect.any(String), options: { sourceAgentId: "a", upToMessageIndex: 1 } } });
    h.receipt(); h.snapshot({ activeSession: h.child(1) });
    expect(h.store.getState().session.activeSession?.messages).toEqual(original.messages.slice(0, 2));
    expect(h.store.getState().input.draft).toBe("");
    expect(h.source).toEqual(original); expect(h.send).toHaveBeenCalledTimes(1);
  });
  it("forks from the final assistant response including that response", () => {
    const h = mount(); h.click("fork");
    expect(h.send.mock.calls[0][0].payload.options.upToMessageIndex).toBe(3);
  });
  it("rewinds before the selected prompt and fences rapid duplicate clicks", () => {
    const h = mount(); const button = h.button("rewind")!;
    button.click(); button.click();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0]).toMatchObject({ type: "REWIND_SESSION", payload: { sourceSessionId: "source", upToMessageIndex: 1 } });
  });
  it("rewinds the first prompt to an empty prefix", () => {
    const h = mount(); h.click("rewind", 0);
    expect(h.send.mock.calls[0][0]).toMatchObject({ type: "REWIND_SESSION", payload: { upToMessageIndex: -1 } });
    h.snapshot({ activeSession: h.rewound(-1) }); h.receipt({ action: "REWIND_SESSION", sessionId: "source" });
    expect(h.store.getState().input.draft).toBe("First");
    expect(h.store.getState().session.activeSession?.messages).toEqual([]);
  });
  it.each(["snapshot-first", "receipt-first"])("restores text only after both confirmations: %s", (order) => {
    const h = mount(); const original = structuredClone(h.source); h.click("rewind");
    if (order === "snapshot-first") h.snapshot({ activeSession: h.rewound() }); else h.receipt({ action: "REWIND_SESSION", sessionId: "source" });
    expect(h.store.getState().input.draft).toBe("");
    if (order === "snapshot-first") h.receipt({ action: "REWIND_SESSION", sessionId: "source" }); else h.snapshot({ activeSession: h.rewound() });
    expect(h.store.getState().input.draft).toBe("Second\nline");
    expect(h.store.getState().input.draftRevision).toBe(1);
    expect(h.store.getState().session.activeSession?.id).toBe("source");
    expect(h.store.getState().session.activeSession?.messages.map((message) => message.content)).toEqual(["First", "Reply one"]);
    expect(h.container.textContent).not.toContain("Reply two");
    expect(h.source).toEqual(original); expect(h.send).toHaveBeenCalledTimes(1);
  });
  it("restores image bytes and MIME types alongside prompt text", () => {
    const h = mount({ messages: [{ role: "user", content: [{ type: "text", text: "Look at this" }, { type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] }] });
    h.click("rewind", 0); h.snapshot({ activeSession: h.rewound(-1) }); h.receipt({ action: "REWIND_SESSION", sessionId: "source" });
    expect(h.store.getState().input).toMatchObject({ draft: "Look at this", attachments: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }] });
  });
  it("disables unsupported multimodal rewind instead of discarding content", () => {
    const h = mount({ messages: [{ role: "user", content: [{ type: "audio", data: "audio", mimeType: "audio/wav" }] }] });
    expect(h.button("rewind", 0)?.disabled).toBe(true);
    expect(h.button("rewind", 0)?.title).toContain("text and images");
    expect(h.container.querySelector(".user-turn [data-action='fork-message']")).toBeNull();
  });
  it.each(["streaming", "waiting_approval"])("disables state changes in %s but allows Copy", (status) => {
    const h = mount({ status: status as any });
    expect(h.button("rewind")?.disabled).toBe(true);
    if (status === "streaming") expect(h.button("fork")).toBeNull();
    else expect(h.button("fork")?.disabled).toBe(true);
    expect(h.button("copy")?.disabled).toBe(false);
  });
  it("disables state changes for detached, disconnected, submitting and pending lifecycles", () => {
    const h = mount({ attached: false }); expect(h.button("fork")?.disabled).toBe(true);
    h.snapshot({ activeSession: h.source, connections: [] }); expect(h.button("fork")?.disabled).toBe(true);
    h.snapshot({ activeSession: { ...h.source, attached: true } }); h.dispatch({ type: "SET_SUBMITTING", payload: true }); expect(h.button("fork")?.disabled).toBe(true);
    h.dispatch({ type: "SET_SUBMITTING", payload: false }); h.dispatch({ type: "LIFECYCLE_STARTED", payload: { agentId: "a", requestId: "other" } }); expect(h.button("fork")?.disabled).toBe(true);
  });
  it("restores input atomically and increments its revision once", () => {
    const restored = inputReducer({ ...initialInputState, draftRevision: 7 }, { type: "RESTORE_PROMPT", payload: { draft: "original", attachments: [{ id: "image-1", type: "image", data: "data", mimeType: "image/png" }] } } as any);
    expect(restored).toMatchObject({ draft: "original", draftRevision: 8, attachments: [{ id: "image-1" }] });
  });
});
