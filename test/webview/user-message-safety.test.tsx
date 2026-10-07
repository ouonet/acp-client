// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "preact/test-utils";
import { messageFixture } from "./user-message-fixture";

let fixture: ReturnType<typeof messageFixture>;
afterEach(() => {
  fixture?.unmount();
  vi.useRealTimers();
});
const mount = () => (fixture = messageFixture());

describe("rewind input safety", () => {
  it("keeps input on failure and displays the returned error", () => {
    const h = mount();
    h.dispatch({ type: "SET_DRAFT", payload: "Unsent draft" });
    h.click("rewind");
    h.receipt({
      success: false,
      error: "Agent refused rewind",
      sessionId: undefined,
    });
    expect(h.store.getState().input.draft).toBe("Unsent draft");
    expect(
      h.container.querySelector(".message-action-feedback")?.textContent,
    ).toContain("Agent refused rewind");
    expect(h.store.getState().agent.lifecyclePending?.a).toBeUndefined();
  });
  it("ignores another request's receipt and waits for the current Session to be truncated", () => {
    const h = mount();
    h.click("rewind");
    h.receipt({ requestId: "other" });
    h.snapshot({ activeSession: h.source });
    expect(h.store.getState().input.draft).toBe("");
    h.receipt();
    expect(h.store.getState().input.draft).toBe("");
    h.snapshot({ activeSession: h.rewound() });
    expect(h.store.getState().input.draft).toBe("Second\nline");
    expect(h.store.getState().session.activeSession?.id).toBe("source");
  });
  it("never overwrites a newer draft with a late rewind result", () => {
    const h = mount();
    h.click("rewind");
    h.snapshot({ activeSession: h.rewound() });
    h.dispatch({ type: "SET_DRAFT", payload: "Newer draft" });
    h.receipt();
    expect(h.store.getState().input.draft).toBe("Newer draft");
    expect(
      h.container.querySelector(".message-action-feedback")?.textContent,
    ).toContain("kept");
  });
  it("preserves edits made in the current Session while the rewind is pending", () => {
    const h = mount();
    h.click("rewind");
    h.dispatch({ type: "SET_DRAFT", payload: "Edited source draft" });
    h.snapshot({ activeSession: h.rewound() });
    h.receipt();
    expect(h.store.getState().input.draft).toBe("Edited source draft");
    expect(
      h.store
        .getState()
        .session.activeSession?.messages.map((message) => message.content),
    ).toEqual(["First", "Reply one"]);
    expect(
      h.container.querySelector(".message-action-feedback")?.textContent,
    ).toContain("kept");
  });
  it("cancels restoration when the Agent generation changes", () => {
    const h = mount();
    h.click("rewind");
    h.snapshot({
      connections: [
        { agentId: "a", initialized: true, status: "running", generation: 4 },
      ],
    });
    h.receipt();
    h.snapshot({
      activeSession: h.rewound(),
      connections: [
        { agentId: "a", initialized: true, status: "running", generation: 4 },
      ],
    });
    expect(h.store.getState().input.draft).toBe("");
    expect(h.store.getState().agent.lifecyclePending?.a).toBeUndefined();
  });
  it("cancels on unrelated navigation rather than modifying another Session", () => {
    const h = mount();
    h.click("rewind");
    h.snapshot({
      activeAgentId: "b",
      activeSession: { ...h.source, id: "unrelated", agentId: "b" },
    });
    h.receipt();
    h.snapshot({ activeSession: h.rewound() });
    expect(h.store.getState().input.draft).toBe("");
  });
  it.each(["receipt", "snapshot"])(
    "settles a missing %s after the confirmation deadline without retrying",
    (missing) => {
      vi.useFakeTimers();
      const h = mount();
      h.click("rewind");
      if (missing === "receipt") h.snapshot({ activeSession: h.rewound() });
      else h.receipt();
      act(() => {
        vi.advanceTimersByTime(20001);
      });
      expect(h.store.getState().input.draft).toBe("");
      expect(h.store.getState().agent.lifecyclePending?.a).toBeUndefined();
      expect(
        h.container.querySelector(".message-action-feedback")?.textContent,
      ).toContain("unconfirmed");
      expect(h.send).toHaveBeenCalledTimes(1);
    },
  );
  it("restores after a matching rewind receipt without a child Session ID", () => {
    const h = mount();
    h.click("rewind");
    h.snapshot({ activeSession: h.rewound() });
    h.receipt();
    expect(h.store.getState().input.draft).toBe("Second\nline");
    expect(h.store.getState().session.activeSession?.id).toBe("source");
  });
  it("clears only its own lifecycle entry", () => {
    const h = mount();
    h.dispatch({
      type: "LIFECYCLE_STARTED",
      payload: { agentId: "a", requestId: "newer" },
    });
    h.dispatch({
      type: "LIFECYCLE_FINISHED",
      payload: { agentId: "a", requestId: "older" },
    });
    expect(h.store.getState().agent.lifecyclePending?.a).toBe("newer");
    h.dispatch({
      type: "LIFECYCLE_FINISHED",
      payload: { agentId: "a", requestId: "newer" },
    });
    expect(h.store.getState().agent.lifecyclePending?.a).toBeUndefined();
  });
});
