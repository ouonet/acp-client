import { describe, it, expect, vi } from "vitest";
import { AppStore } from "../../src/webview/state/app-store";

describe("T3: Reactive AppStore Slices", () => {
  it("initializes with default slice states", () => {
    const store = new AppStore();
    const state = store.getState();
    expect(state.session.sessions).toEqual([]);
    expect(state.session.streamingText).toBe("");
    expect(state.agent.agentConfigs).toEqual([]);
    expect(state.input.draft).toBe("");
  });

  it("applies snapshot and synchronizes all slices", () => {
    const store = new AppStore();
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeSession: {
          id: "sess-1",
          agentId: "agent-a",
          status: "idle",
          model: "gpt-4",
          availableModels: ["gpt-4", "claude-3"],
          thinkingLevel: "high",
          availableCommands: [{ name: "compact", description: "compact context" }],
        },
        sessions: [{ sessionId: "sess-1", title: "Test Session" }],
        agentConfigs: [{ id: "agent-a", name: "Agent A" }],
        processStatuses: { "agent-a": "running" },
        inputHistory: ["prev prompt 1", "prev prompt 2"],
      },
    });

    const state = store.getState();
    expect(state.session.activeSession?.id).toBe("sess-1");
    expect(state.session.sessions.length).toBe(1);
    expect(state.agent.selectedAgentId).toBe("agent-a");
    expect(state.agent.processStatuses["agent-a"]).toBe("running");
    expect(state.input.selectedModel).toBe("gpt-4");
    expect(state.input.availableModels).toEqual(["gpt-4", "claude-3"]);
    expect(state.input.availableCommands.length).toBe(1);
    expect(state.input.history).toEqual(["prev prompt 1", "prev prompt 2"]);
  });

  it("appends streaming chunk and thinking text", () => {
    const store = new AppStore();
    store.dispatch({ type: "CHUNK", payload: "Hello " });
    store.dispatch({ type: "CHUNK", payload: "world!" });
    store.dispatch({ type: "THINKING", payload: "Reasoning..." });

    expect(store.getState().session.streamingText).toBe("Hello world!");
    expect(store.getState().session.streamingThinking).toBe("Reasoning...");

    // Idle status clears streaming buffer
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: { activeSession: { id: "sess-1", status: "streaming" } },
    });
    store.dispatch({ type: "SESSION_STATUS_CHANGE", payload: { status: "idle" } });
    expect(store.getState().session.streamingText).toBe("");
    expect(store.getState().session.streamingThinking).toBe("");
  });

  it("handles history navigation with draft restoration", () => {
    const store = new AppStore();
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: { inputHistory: ["first", "second", "third"] },
    });

    store.dispatch({ type: "SET_DRAFT", payload: "my draft" });

    // Arrow Up: restores third, then second
    store.dispatch({ type: "HISTORY_NAV", payload: "up" });
    expect(store.getState().input.draft).toBe("third");

    store.dispatch({ type: "HISTORY_NAV", payload: "up" });
    expect(store.getState().input.draft).toBe("second");

    // Arrow Down: restores third, then my draft
    store.dispatch({ type: "HISTORY_NAV", payload: "down" });
    expect(store.getState().input.draft).toBe("third");

    store.dispatch({ type: "HISTORY_NAV", payload: "down" });
    expect(store.getState().input.draft).toBe("my draft");
  });

  it("notifies subscribers on dispatch", () => {
    const store = new AppStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({ type: "SET_DRAFT", payload: "test" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.dispatch({ type: "SET_DRAFT", payload: "test 2" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("model selection state", () => {
  it("clears stale options on a session switch and tracks a pending change", async () => {
    const { AppStore } = await import("../../src/webview/state/app-store");
    const store = new AppStore();
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: { activeSession: { id: "one", agentId: "a", model: "old", thinkingLevel: "deep", availableModels: ["old", "new"], availableThinkingLevels: ["deep"] } } });
    store.dispatch({ type: "CONFIG_CHANGE_STARTED", payload: { requestId: "r", sessionId: "one" } });
    expect(store.getState().input.configPending).toBeTruthy();
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: { activeSession: { id: "two", agentId: "a", availableModels: [] } } });
    expect(store.getState().input).toMatchObject({ availableModels: [], availableThinkingLevels: [] });
    expect(store.getState().input.thinkingLevel).toBeUndefined();
    expect(store.getState().input.configPending).toBeUndefined();
  });
});

describe("config change correlation", () => {
  it("releases only the matching pending change even while viewing another session", async () => {
    const { AppStore } = await import("../../src/webview/state/app-store");
    const store = new AppStore();
    const snap = (id: string) => ({ activeSession: { agentId: "a", id, modelConfigId: "engine", model: "m1", availableModels: ["m1", "m2"], availableThinkingLevels: [] } });
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap("one") });
    store.dispatch({ type: "CONFIG_CHANGE_STARTED", payload: { requestId: "r", sessionId: "one" } });
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap("two") });
    store.dispatch({ type: "ACTION_RESULT", payload: { action: "SET_CONFIG_OPTION", requestId: "r", success: false, error: "denied" } });
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: snap("one") });
    expect(store.getState().input.configPending).toBeUndefined();
    expect(store.getState().input.configError).toBe("denied");
  });
});
