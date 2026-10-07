// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AssistantTurn } from "../../src/webview/components/chat/assistant-turn";
import { UserBubble } from "../../src/webview/components/chat/user-bubble";
import { ToolCallCard } from "../../src/webview/components/chat/tool-call-card";
import { ActionProvider } from "../../src/webview/state/action-context";
import {
  sessionReducer,
  initialSessionState,
} from "../../src/webview/state/session-slice";
import type { SessionState } from "../../src/webview/state/types";
import type { MessageChunk, ToolCall } from "../../src/core/types/session";

const container = document.createElement("div");
const send = vi.fn();
const call: ToolCall = {
  id: "c1",
  name: "readFile",
  input: { path: "src/index.ts" },
  output: "export const x = 1",
  status: "completed",
  startedAt: 1000,
  completedAt: 2000,
};
function mount(node: any) {
  act(() =>
    render(<ActionProvider onAction={send}>{node}</ActionProvider>, container),
  );
}
afterEach(() => {
  act(() => render(null, container));
  vi.restoreAllMocks();
  vi.useRealTimers();
  send.mockClear();
});

describe("documented conversation rendering", () => {
  it("places Agent metadata and Copy together with Fork after execution and final output", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const fork = vi.fn();
    mount(
      <AssistantTurn
        agentName="Agent A"
        model="model-a"
        onFork={fork}
        message={{
          content: "Final answer",
          startedAt: new Date("2026-10-07T14:32:00").getTime(),
          completedAt: new Date("2026-10-07T14:32:08").getTime(),
          turns: [{ thinking: "Inspect", toolCalls: [call] }],
        }}
      />,
    );
    const row = container.querySelector(".assistant-turn")!;
    const content = row.querySelector(".assistant-content")!;
    const footer = row.querySelector(".assistant-message-actions")!;
    expect(row.firstElementChild).toBe(content);
    expect(content.nextElementSibling).toBe(footer);
    expect(footer.textContent).toContain("Agent A");
    expect(footer.textContent).not.toContain("model-a");
    expect(footer.querySelector(".turn-timestamp")?.textContent).toBe(
      "14:32:08",
    );
    const copy = footer.querySelector<HTMLButtonElement>('[title="Copy all"]')!;
    const branch = footer.querySelector<HTMLButtonElement>(
      '[data-action="fork-message"]',
    )!;
    expect(copy.parentElement).toBe(branch.parentElement);
    copy.click();
    branch.click();
    expect(writeText.mock.calls[0][0]).toContain("Inspect");
    expect(writeText.mock.calls[0][0]).toContain("Final answer");
    expect(fork).toHaveBeenCalledOnce();
  });
  it("shows a focusable user card and copies the original multiline prompt", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    mount(<UserBubble content={"line one\nline two"} />);
    expect(container.querySelector(".turn-header")).toBeNull();
    expect(container.querySelector<HTMLElement>(".user-turn")?.tabIndex).toBe(
      0,
    );
    const button = container.querySelector(
      '[title="Copy prompt"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(writeText).toHaveBeenCalledWith("line one\nline two");
  });
  it("renders ordered turns, unavailable thinking and tools inside one execution group", () => {
    const message = {
      content: "Final answer",
      startedAt: 1000,
      completedAt: 4000,
      turns: [
        {
          thinking: "Inspect the files",
          toolCalls: [call],
          startedAt: 1000,
          completedAt: 2500,
        },
        {
          thinking: "",
          toolCalls: [{ ...call, id: "c2", name: "verify" }],
          startedAt: 2500,
          completedAt: 4000,
        },
      ],
    };
    mount(<AssistantTurn message={message} />);
    expect(
      container.querySelector(".execution-card-header")?.textContent,
    ).toContain("Worked · 3.0s · 2 turns · 2 calls");
    const turns = container.querySelectorAll(".internal-turn-card");
    expect(turns).toHaveLength(2);
    expect(turns[0].textContent).toContain("Inspect the files");
    expect(turns[1].textContent).toContain("Thinking unavailable");
    expect(turns[0].querySelector('[data-tool-id="c1"]')).not.toBeNull();
    expect(turns[1].querySelector('[data-tool-id="c2"]')).not.toBeNull();
    expect(container.querySelector(".turn-tools")).toBeNull();
    expect(container.textContent).not.toContain("Tools Executed");
    expect(
      Array.from(
        turns[0].querySelector(".internal-turn-body")?.children ?? [],
      ).map((node) => node.getAttribute("data-tool-id")),
    ).toEqual(["c1"]);
    expect(
      Array.from(
        turns[1].querySelector(".internal-turn-body")?.children ?? [],
      ).map((node) => node.getAttribute("data-tool-id")),
    ).toEqual(["c2"]);
    expect(
      container.querySelector(".execution-steps-card .markdown-body"),
    ).toBeNull();
    expect(container.querySelector(".markdown-body")?.textContent).toContain(
      "Final answer",
    );
  });
  it("uses Worked and stops the execution clock when final output starts while still streaming", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
    mount(
      <AssistantTurn
        isStreaming
        message={{
          content: "Final",
          startedAt: 1000,
          completedAt: 3000,
          turns: [
            {
              thinking: "Reason",
              toolCalls: [],
              startedAt: 1000,
              completedAt: 3000,
            },
          ],
        }}
      />,
    );
    expect(
      container.querySelector(".execution-card-header")?.textContent,
    ).toContain("Worked · 2.0s");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      container.querySelector(".execution-card-header")?.textContent,
    ).toContain("Worked · 2.0s");
    expect(container.querySelector("[data-tool-id]")).toBeNull();
    expect(container.querySelector(".turn-tools")).toBeNull();
    expect(container.textContent).not.toContain("Tools Executed");
    vi.useRealTimers();
  });
  it("shows turn calls as direct children and starts a large completed turn collapsed", () => {
    mount(
      <AssistantTurn
        message={{
          content: "",
          turns: [
            {
              thinking: "Reason",
              toolCalls: Array.from({ length: 65 }, (_, i) => ({
                ...call,
                id: `c${i}`,
              })),
            },
          ],
        }}
      />,
    );
    const card = container.querySelector(".internal-turn-card") as HTMLElement;
    const header = card.querySelector(
      ".internal-turn-header",
    ) as HTMLButtonElement;
    const body = card.querySelector(".internal-turn-body") as HTMLElement;
    document.body.appendChild(container);
    const style = document.createElement("style");
    style.textContent =
      ".internal-turn-card:not(.expanded) .internal-turn-body { display: none; }";
    document.head.appendChild(style);
    expect(header.textContent).not.toContain("readFile");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(card.classList.contains("expanded")).toBe(false);
    expect(getComputedStyle(body).display).toBe("none");
    expect(body.querySelectorAll("[data-tool-id]")).toHaveLength(65);
    expect(container.querySelector(".turn-tools")).toBeNull();
    expect(container.textContent).not.toContain("Tools Executed");
    act(() => header.click());
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(getComputedStyle(body).display).not.toBe("none");
    expect(
      Array.from(body.children).map((node) =>
        node.getAttribute("data-tool-id"),
      ),
    ).toEqual(Array.from({ length: 65 }, (_, index) => `c${index}`));
    act(() =>
      (
        container.querySelector(".tool-call-header") as HTMLButtonElement
      ).click(),
    );
    expect(container.querySelector(".tool-call-card.expanded")).not.toBeNull();
    expect(
      container
        .querySelector(".execution-card-header")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    style.remove();
  });
  it("shows input and result previews, elapsed time and valid falsy details", () => {
    mount(<ToolCallCard toolCall={{ ...call, input: false, output: 0 }} />);
    expect(container.querySelector(".tool-call-header")?.textContent).toContain(
      "false",
    );
    expect(container.querySelector(".tool-call-header")?.textContent).toContain(
      "0",
    );
    expect(container.querySelector(".tool-call-header")?.textContent).toContain(
      "1.0s",
    );
    act(() =>
      (
        container.querySelector(".tool-call-header") as HTMLButtonElement
      ).click(),
    );
    expect(container.querySelectorAll(".tool-section")).toHaveLength(2);
    mount(<ToolCallCard toolCall={{ ...call, input: null, output: "" }} />);
    expect(container.querySelectorAll(".tool-section")).toHaveLength(0);
  });
  it("keeps failed and denied labels, escapes HTML and preserves safe diff actions", () => {
    mount(
      <ToolCallCard
        toolCall={{
          ...call,
          status: "failed",
          output: "<img src=x onerror=alert(1)>",
        }}
      />,
    );
    expect(container.querySelector(".tool-badge")?.textContent).toBe("failed");
    act(() =>
      (
        container.querySelector(".tool-call-header") as HTMLButtonElement
      ).click(),
    );
    expect(container.querySelector("img")).toBeNull();
    mount(
      <ToolCallCard
        toolCall={{ ...call, input: { path: "x.ts", diff: "@@\n-old\n+new" } }}
      />,
    );
    expect(container.querySelector(".tool-diff-container")).not.toBeNull();
    expect(container.querySelector('[title="Apply diff"]')).toBeNull();
    mount(
      <ToolCallCard
        toolCall={{
          ...call,
          input: {
            path: "x.ts",
            diff: "@@\n-old\n+new",
            originalContent: "old",
            modifiedContent: "new",
          },
        }}
      />,
    );
    act(() =>
      (
        container.querySelector('[title="Apply diff"]') as HTMLButtonElement
      ).click(),
    );
    expect(send).toHaveBeenCalledWith({
      type: "APPLY_FILE_DIFF",
      payload: { filePath: "x.ts", originalContent: "old", content: "new" },
    });
  });
});

describe("live turn projection", () => {
  function initial(): SessionState {
    return {
      ...initialSessionState,
      activeSession: {
        id: "s",
        agentId: "a",
        title: "",
        status: "streaming",
        createdAt: 1000,
        updatedAt: 1000,
        messages: [
          {
            role: "assistant",
            content: "",
            startedAt: 1000,
            turns: [],
            toolCalls: [],
          },
        ],
      },
    };
  }
  it("preserves thought boundaries and routes late tool updates to the original turn", () => {
    let state = initial();
    state = sessionReducer(state, {
      type: "THINKING",
      payload: {
        text: "Inspect",
        turnIndex: 1,
        startedAt: 1000,
        messageStartedAt: 1000,
      },
    });
    state = sessionReducer(state, {
      type: "TOOL_CALL",
      payload: {
        ...call,
        status: "running",
        output: undefined,
        completedAt: undefined,
        turnIndex: 1,
      },
    });
    state = sessionReducer(state, {
      type: "THINKING",
      payload: {
        text: "",
        turnIndex: 2,
        startedAt: 2500,
        previousTurnCompletedAt: 2500,
      },
    });
    state = sessionReducer(state, {
      type: "TOOL_RESULT",
      payload: {
        id: "c1",
        status: "completed",
        input: { path: "new.ts" },
        output: false,
        completedAt: 3000,
      },
    });
    const message = state.activeSession!.messages[0];
    expect(message.turns).toHaveLength(2);
    expect(message.turns![0].completedAt).toBe(2500);
    expect(message.turns![0].toolCalls[0]).toMatchObject({
      input: { path: "new.ts" },
      output: false,
      completedAt: 3000,
    });
    expect(message.turns![1].thinking).toBe("");
    expect(message.turns![1].toolCalls).toHaveLength(0);
  });
  it("renders the same hierarchy from live events and restored snapshots", () => {
    let state = initial();
    state = sessionReducer(state, {
      type: "THINKING",
      payload: {
        text: "Inspect",
        turnIndex: 1,
        startedAt: 1000,
        messageStartedAt: 1000,
      },
    });
    state = sessionReducer(state, {
      type: "TOOL_CALL",
      payload: { ...call, turnIndex: 1 },
    });
    const live = state.activeSession!.messages[0];
    mount(<AssistantTurn message={live} />);
    expect(container.querySelectorAll(".internal-turn-card")).toHaveLength(1);
    const liveStructure = container.querySelector(
      ".execution-steps-body",
    )!.innerHTML;
    const restored: MessageChunk = {
      role: "assistant",
      content: "",
      thinking: "Inspect",
      toolCalls: [call],
      turns: [{ thinking: "Inspect", toolCalls: [call], startedAt: 1000 }],
    };
    mount(<AssistantTurn message={restored} />);
    expect(container.querySelector(".execution-steps-body")?.innerHTML).toBe(
      liveStructure,
    );
  });
});
