// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AssistantTurn } from "../../src/webview/components/chat/assistant-turn";
import { sessionReducer, initialSessionState } from "../../src/webview/state/session-slice";
import { reconcileHistory } from "../../src/webview/state/stream-messages";
import type { MessageChunk, SessionData } from "../../src/core/types/session";

const container = document.createElement("div");
afterEach(() => { act(() => render(null, container)); vi.useRealTimers(); });
function stateWith(messages: MessageChunk[]) {
  const activeSession: SessionData = { id: "s", agentId: "a", title: "", status: "streaming", createdAt: 1, updatedAt: 1, messages };
  return { ...initialSessionState, activeSession };
}

describe("execution stream boundaries", () => {
  it("starts a new assistant message before its snapshot arrives without changing the previous prompt", () => {
    const previous: MessageChunk = { role: "assistant", content: "Previous reply", thinking: "Previous reasoning", startedAt: 1000, completedAt: 2000 };
    const state = sessionReducer(stateWith([previous]), { type: "THINKING", payload: { text: "New reasoning", turnIndex: 1, startedAt: 3000, messageStartedAt: 3000 } });
    expect(state.activeSession!.messages).toHaveLength(2);
    expect(state.activeSession!.messages[0]).toEqual(previous);
    expect(state.activeSession!.messages[1]).toMatchObject({ startedAt: 3000, thinking: "New reasoning" });
  });
  it("starts a tool-only prompt before its snapshot without changing the previous prompt", () => {
    const previous: MessageChunk = { role: "assistant", content: "Previous", startedAt: 1000, completedAt: 2000 };
    const state = sessionReducer(stateWith([previous]), { type: "TOOL_CALL", payload: { id: "c", name: "read", input: {}, status: "running", startedAt: 3100, messageStartedAt: 3000, turnIndex: 1 } });
    expect(state.activeSession!.messages).toHaveLength(2);
    expect(state.activeSession!.messages[0]).toEqual(previous);
  });
  it("retains elapsed endpoints and late tool results across a stale same-session snapshot", () => {
    const tool = { id: "c", name: "read", input: false, output: 0, status: "completed" as const, startedAt: 1000, completedAt: 2000 };
    const current: MessageChunk = { role: "assistant", content: "Final", startedAt: 1000, completedAt: 2500, turns: [{ thinking: "Inspect", startedAt: 1000, completedAt: 2500, toolCalls: [tool] }] };
    const incoming: MessageChunk = { role: "assistant", content: "", startedAt: 1000, turns: [{ thinking: "Ins", toolCalls: [{ ...tool, status: "running", output: undefined, completedAt: undefined }] }] };
    const message = reconcileHistory([current], [incoming])[0];
    expect(message.completedAt).toBe(2500);
    expect(message.turns![0].completedAt).toBe(2500);
    expect(message.turns![0].toolCalls[0]).toMatchObject({ status: "completed", output: 0, completedAt: 2000 });
  });
  it("closes the execution clock on the first final chunk and never extends it on later chunks", () => {
    vi.useFakeTimers(); vi.setSystemTime(3000);
    let state = stateWith([{ role: "assistant", content: "", startedAt: 1000, turns: [{ thinking: "Reason", startedAt: 1000, toolCalls: [] }] }]);
    state = sessionReducer(state, { type: "CHUNK", payload: { text: "Final" } }) as typeof state;
    vi.setSystemTime(9000);
    state = sessionReducer(state, { type: "CHUNK", payload: { text: " answer" } }) as typeof state;
    expect(state.activeSession!.messages[0].completedAt).toBe(3000);
    expect(state.activeSession!.messages[0].turns![0].completedAt).toBe(3000);
  });
  it("refreshes Working durations live and leaves un-timed restored history without invented durations", () => {
    vi.useFakeTimers(); vi.setSystemTime(2000);
    act(() => render(<AssistantTurn isStreaming message={{ startedAt: 1000, turns: [{ thinking: "Reason", startedAt: 1000, toolCalls: [] }] }} />, container));
    expect(container.querySelector(".execution-card-header")?.textContent).toContain("Working · 1.0s");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelector(".execution-card-header")?.textContent).toContain("Working · 2.0s");
    act(() => render(<AssistantTurn message={{ thinking: "Old thinking", toolCalls: [] }} />, container));
    expect(container.querySelector(".execution-card-header")?.textContent).toBe("Worked · 1 turns · 0 calls");
    expect(vi.getTimerCount()).toBe(0);
  });
});
