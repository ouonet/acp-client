// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { WebviewStateSnapshot } from "../../src/shared/ipc-protocol";
import { snapshot } from "./preact-regression-fixtures";
import { productionEntryFixture } from "./production-entry-fixture";

const app = productionEntryFixture();
const connection = {
  agentId: "a1",
  generation: 1,
  status: "running",
  initialized: true,
  capabilities: { loadSession: true, sessionCapabilities: { list: {} } },
} satisfies NonNullable<WebviewStateSnapshot["connections"]>[number];

describe("shipped remote Session history", () => {
  it("loads the selected remote Session and sends the next prompt on its existing ID", async () => {
    await app.host("STATE_SNAPSHOT", {
      ...snapshot(),
      activeAgentId: "a1",
      connections: [connection],
    });
    await app.click('[title="Session History"]');
    const history = app.actions.find(
      (action) => action.type === "REQUEST_AGENT_HISTORY",
    );
    expect(history?.type).toBe("REQUEST_AGENT_HISTORY");
    if (!history || history.type !== "REQUEST_AGENT_HISTORY")
      throw new Error("No history request");
    await app.host("AGENT_HISTORY_RESULT", {
      requestId: history.payload.requestId,
      agentId: "a1",
      generation: 1,
      sessions: [
        {
          id: "remote-existing",
          title: "Past conversation",
          cwd: "/workspace",
        },
      ],
    });
    await app.click(".session-item");
    const selection = app.actions.find(
      (action) => action.type === "SWITCH_SESSION",
    );
    expect(selection?.type).toBe("SWITCH_SESSION");
    if (!selection || selection.type !== "SWITCH_SESSION")
      throw new Error("No switch request");
    expect(selection.payload).toMatchObject({
      sessionId: "remote-existing",
      agentId: "a1",
    });
    await app.host("STATE_SNAPSHOT", {
      ...snapshot("remote-existing", "idle", [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
      ]),
      activeAgentId: "a1",
      connections: [connection],
    });
    await app.host("ACTION_RESULT", {
      requestId: selection.payload.requestId,
      action: "SWITCH_SESSION",
      agentId: "a1",
      generation: 1,
      sessionId: "remote-existing",
      success: true,
    });
    expect(app.root().querySelector(".history-drawer")).toBeNull();
    expect(app.root().textContent).toContain("Earlier answer");
    expect(app.input().value).toBe("");
    await app.fill("Continue this conversation");
    const prompt = await app.submit();
    expect(prompt.payload).toMatchObject({
      sessionId: "remote-existing",
      agentId: "a1",
      prompt: "Continue this conversation",
    });
    expect(
      app.actions.some(
        (action) =>
          action.type === "CREATE_SESSION" || action.type === "FORK_SESSION",
      ),
    ).toBe(false);
  });
});
