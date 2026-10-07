import { act } from "preact/test-utils";
import { afterEach, beforeEach, vi } from "vitest";
import type { WebviewAction, WebviewStateSnapshot } from "../../src/shared/ipc-protocol";
import { snapshot } from "./preact-regression-fixtures";
import { productionEntryFixture } from "./production-entry-fixture";

export const connection = {
  agentId: "a1",
  generation: 1,
  status: "running",
  initialized: true,
  capabilities: { loadSession: true, sessionCapabilities: { list: {}, delete: {} } },
} satisfies NonNullable<WebviewStateSnapshot["connections"]>[number];
export const sessions = [
  {
    id: "remote-existing",
    title: "Past conversation",
    cwd: "/workspace/long/directory",
    updatedAt: "2026-10-06T12:00:00Z",
  },
  { id: "s1", title: "Current conversation" },
  { id: "missing-metadata", updatedAt: "invalid" },
];

export function historyActionsFixture() {
  const app = productionEntryFixture();
  const last = <T extends WebviewAction["type"]>(type: T) => {
    const action = app.actions.filter((a) => a.type === type).at(-1);
    if (!action) throw new Error(`Missing ${type}`);
    return action as Extract<WebviewAction, { type: T }>;
  };
  const list = async (items = sessions, nextCursor?: string) => {
    const request = last("REQUEST_AGENT_HISTORY");
    await app.host("AGENT_HISTORY_RESULT", {
      requestId: request.payload.requestId,
      agentId: request.payload.agentId,
      generation: 1,
      sessions: items,
      nextCursor,
    });
    return request;
  };
  const open = async (override: Partial<WebviewStateSnapshot> = {}) => {
    await app.host("STATE_SNAPSHOT", { ...snapshot(), activeAgentId: "a1", connections: [connection], ...override });
    await app.click('[title="Session History"]');
    return list();
  };
  const search = async (query: string) => {
    await act(() => {
      const input = app.root().querySelector<HTMLInputElement>('[aria-label="Search Agent history"]')!;
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const receipt = (success: boolean, overrides: Record<string, unknown> = {}) => {
    const action = last("DELETE_SESSION");
    return app.host("ACTION_RESULT", {
      ...action.payload,
      action: "DELETE_SESSION",
      success,
      ...(!success ? { error: "Delete refused" } : {}),
      ...overrides,
    });
  };
  const beginDelete = async (id = "remote-existing") => {
    await app.click(`[data-session-id="${id}"] [aria-label="Delete Session"]`);
    await app.click('[aria-label="Confirm delete Session"]');
    return last("DELETE_SESSION");
  };
  beforeEach(async () => {
    const close = app.root().querySelector<HTMLButtonElement>('[aria-label="Close History"]');
    if (close) await act(() => close.click());
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  });
  afterEach(async () => {
    for (const action of app.actions) {
      if (action.type === "DELETE_SESSION" || action.type === "SWITCH_SESSION") {
        await app.host("ACTION_RESULT", { ...action.payload, action: action.type, success: false });
      }
    }
    vi.restoreAllMocks();
  });
  return { ...app, last, list, open, search, receipt, beginDelete };
}
