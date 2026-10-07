// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatViewComponent,
  renderMarkdown,
} from "../../src/webview/components/chat-view";
import { ThinkingBlockComponent } from "../../src/webview/components/thinking-block";
import type { MessageChunk } from "../../src/core/types/session";

describe("T4: ChatViewComponent & Collapsible ThinkingBlock", () => {
  let container: HTMLElement;
  let onActionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    onActionMock = vi.fn();
  });

  describe("renderMarkdown", () => {
    it("should format code blocks with copy action and syntax highlighting without insert button", () => {
      const markdown = "Here is code:\n```typescript\nconst a = 1;\n```";
      const html = renderMarkdown(markdown);

      expect(html).toContain('class="code-block-wrapper"');
      expect(html).toContain("typescript");
      expect(html).toContain('class="token-keyword">const</span>');
      expect(html).toContain('class="token-number">1</span>');
      expect(html).toContain('data-action="copy-code"');
      expect(html).not.toContain('data-action="insert-code"');
    });

    it("should format bold, inline code, and line breaks", () => {
      const markdown = "This is **bold** and `code`.\nNext line.";
      const html = renderMarkdown(markdown);

      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<code>code</code>");
      expect(html).toContain("<br>");
    });

    it("should format file paths with line ranges as clickable file links", () => {
      const markdown =
        "Check `tests/integration/test_plugin_lifecycle_e2e.py:142-150` and also src/vscode/acp-view-provider.ts:410 for details.";
      const html = renderMarkdown(markdown);

      expect(html).toContain('class="file-path-link"');
      expect(html).toContain(
        'data-path="tests/integration/test_plugin_lifecycle_e2e.py"',
      );
      expect(html).toContain('data-start-line="142"');
      expect(html).toContain('data-end-line="150"');
      expect(html).toContain('data-path="src/vscode/acp-view-provider.ts"');
      expect(html).toContain('data-start-line="410"');
    });

    it("should eliminate unnecessary blank space around code blocks", () => {
      const markdown = '```json\n{\n  "available": true\n}\n```';
      const html = renderMarkdown(markdown);

      expect(html).toContain('<div class="code-block-wrapper">');
      expect(html).toContain('<pre class="code-block-pre"><code>');
      expect(html).not.toMatch(/<pre[^>]*>\s+<div/);
    });
  });

  describe("ThinkingBlockComponent", () => {
    it("should render collapsible thinking block and toggle expansion on header click", () => {
      new ThinkingBlockComponent({
        container,
        thinking: "Step 1: Parse requirements.\nStep 2: Generate response.",
        durationSeconds: 3.5,
      });

      const card = container.querySelector(".thinking-card");
      expect(card).not.toBeNull();
      expect(card?.classList.contains("expanded")).toBe(false);

      const header = container.querySelector(".thinking-header") as HTMLElement;
      expect(header.textContent).toContain("Thinking (3.5s)");

      // Click to expand
      header.click();
      expect(card?.classList.contains("expanded")).toBe(true);

      // Verify thinking body content
      const body = container.querySelector(".thinking-body");
      expect(body?.textContent).toContain("Step 1: Parse requirements.");

      // Click again to collapse
      header.click();
      expect(card?.classList.contains("expanded")).toBe(false);
    });
  });

  describe("ChatViewComponent", () => {
    it("should render user and assistant messages with thinking blocks and tool call cards", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      const messages: MessageChunk[] = [
        {
          role: "user",
          content: "Hello, please write a test function.",
        },
        {
          role: "assistant",
          thinking: "Planning the test function structure...",
          content:
            "Here is the function:\n```javascript\nfunction test() {}\n```",
          toolCalls: [
            {
              id: "call-1",
              name: "writeFile",
              input: { path: "/tmp/test.js" },
              status: "completed",
            },
          ],
        },
      ];

      chatView.renderMessages(messages);

      const userRow = container.querySelector(".message-row.user");
      expect(userRow?.textContent).toContain(
        "Hello, please write a test function.",
      );

      const assistantRow = container.querySelector(".message-row.assistant");
      expect(assistantRow?.textContent).toContain("function test()");
      expect(
        assistantRow?.querySelector(".internal-turn-title")?.textContent,
      ).toContain("Planning the test function structure...");
      expect(assistantRow?.querySelector(".tool-call-card")).not.toBeNull();
      expect(assistantRow?.querySelector(".tool-name")?.textContent).toBe(
        "writeFile",
      );
    });

    it("should dispatch OPEN_FILE when a file path link is clicked", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      chatView.renderMessages([
        {
          role: "assistant",
          content: "See `src/index.ts:15-30` for implementation.",
        },
      ]);

      const fileLink = container.querySelector(
        ".file-path-link",
      ) as HTMLElement;
      expect(fileLink).not.toBeNull();
      fileLink.click();

      expect(onActionMock).toHaveBeenCalledWith({
        type: "OPEN_FILE",
        payload: {
          filePath: "src/index.ts",
          startLine: 15,
          endLine: 30,
        },
      });
    });

    it("should render 3-level hierarchical collapsible turn stream for assistant responses", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      const messages: MessageChunk[] = [
        {
          role: "assistant",
          thinking: "Deep thought about architecture...",
          content: "Here is the final answer.",
          toolCalls: [
            {
              id: "call-1",
              name: "read_file",
              input: { path: "src/main.ts" },
              output: "const x = 1;",
              status: "completed",
            },
          ],
        },
      ];

      chatView.renderMessages(messages);

      // Level 1: Execution Steps Card
      const execCard = container.querySelector(
        ".execution-steps-card",
      ) as HTMLElement;
      expect(execCard).not.toBeNull();
      // Auto-collapsed when response content exists
      expect(execCard.classList.contains("expanded")).toBe(false);

      const execHeader = execCard.querySelector(
        ".execution-card-header",
      ) as HTMLElement;
      expect(execHeader.textContent).toContain("Worked");

      // Click to expand Level 1
      execHeader.click();
      expect(execCard.classList.contains("expanded")).toBe(true);

      // Click to re-collapse Level 1
      execHeader.click();
      expect(execCard.classList.contains("expanded")).toBe(false);

      // Level 2: Internal Turn Card
      const turnCard = execCard.querySelector(
        ".internal-turn-card",
      ) as HTMLElement;
      expect(turnCard).not.toBeNull();
      expect(turnCard.classList.contains("expanded")).toBe(true);

      const turnHeader = turnCard.querySelector(
        ".internal-turn-header",
      ) as HTMLElement;
      expect(turnHeader.textContent).toContain(
        "Deep thought about architecture...",
      );
      // Turn header must NOT concatenate raw tool names into title
      expect(turnHeader.textContent).not.toContain("read_file");

      // Click to collapse Level 2
      turnHeader.click();
      expect(turnCard.classList.contains("expanded")).toBe(false);

      // Tool calls sit directly below the turn's thinking line.
      const toolsContainer = turnCard.querySelector(
        ".turn-tools-container",
      ) as HTMLElement;
      expect(toolsContainer).not.toBeNull();
      expect(toolsContainer.querySelector(".turn-tools-toggle")).toBeNull();

      const toolCard = turnCard.querySelector(".tool-call-card") as HTMLElement;
      expect(toolCard).not.toBeNull();
      expect(toolCard.querySelector(".tool-name")?.textContent).toBe(
        "read_file",
      );
      expect(toolCard.textContent).toContain("src/main.ts");
      expect(toolCard.textContent).toContain("const x = 1;");

      // Final Response Block (below execution card)
      const finalResp = container.querySelector(".final-response-container");
      expect(finalResp).not.toBeNull();
      expect(finalResp?.textContent).toContain("Here is the final answer.");
    });

    it("updates live thinking, tool previews, and completion state", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });
      const start = Date.now() - 5000;
      chatView.appendThinkingChunk("Reading source", 1, start, start);
      chatView.appendToolCall(
        {
          id: "live-tool",
          name: "read_file",
          input: { path: "src/a.ts" },
          status: "running",
          startedAt: start + 1000,
        },
        1,
        start,
      );
      expect(
        container.querySelector(".execution-card-header")?.textContent,
      ).toContain("Working");
      expect(
        container.querySelector(".execution-card-header")?.textContent,
      ).toContain("1 turn · 1 call");
      chatView.updateToolResult(
        "live-tool",
        "file contents",
        "completed",
        undefined,
        undefined,
        start + 2000,
      );
      expect(
        container.querySelector(".tool-call-header")?.textContent,
      ).toContain("file contents");
      expect(
        container.querySelector(".tool-call-header")?.textContent,
      ).toContain("1.0s");
      chatView.appendAssistantChunk("Answer");
      expect(
        container.querySelector(".execution-card-header")?.textContent,
      ).toContain("Worked");
    });

    it("shows compact persisted thinking, call details, and elapsed times", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });
      chatView.renderMessages([
        {
          role: "assistant",
          content: "Answer",
          startedAt: 1000,
          completedAt: 4500,
          turns: [
            {
              thinking: "Inspecting source",
              startedAt: 1000,
              completedAt: 4500,
              toolCalls: [
                {
                  id: "tool-1",
                  name: "read_file",
                  input: { path: "src/main.ts" },
                  output: "source text",
                  status: "completed",
                  startedAt: 2000,
                  completedAt: 3200,
                },
              ],
            },
          ],
        },
      ]);
      expect(
        container.querySelector(".execution-card-header")?.textContent,
      ).toContain("Worked");
      expect(
        container.querySelector(".execution-card-header")?.textContent,
      ).toContain("3.5s");
      expect(
        container.querySelector(".internal-turn-header")?.textContent,
      ).toContain("Inspecting source");
      expect(
        container.querySelector(".internal-turn-header")?.textContent,
      ).not.toContain("Turn 1");
      expect(
        container.querySelector(".tool-call-header")?.textContent,
      ).toContain("read_file");
      expect(
        container.querySelector(".tool-call-header")?.textContent,
      ).toContain("src/main.ts");
      expect(
        container.querySelector(".tool-call-header")?.textContent,
      ).toContain("source text");
      expect(
        container.querySelector(".tool-call-header")?.textContent,
      ).toContain("1.2s");
    });

    it("renders persisted thinking turns with their own tools and an empty-thinking placeholder", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });
      chatView.renderMessages([
        {
          role: "assistant",
          content: "Final answer",
          turns: [
            {
              thinking: "First reason",
              toolCalls: [
                {
                  id: "tool-1",
                  name: "read_file",
                  input: {},
                  status: "completed",
                },
              ],
            },
            {
              thinking: "",
              toolCalls: [
                {
                  id: "tool-2",
                  name: "list_dir",
                  input: {},
                  status: "completed",
                },
              ],
            },
            { thinking: "Third reason", toolCalls: [] },
          ],
        },
      ]);

      const turns = container.querySelectorAll(".internal-turn-card");
      expect(turns).toHaveLength(3);
      expect(
        container.querySelector(".execution-stats")?.textContent,
      ).toContain("3 turns · 2 calls");
      expect(turns[0].textContent).toContain("First reason");
      expect(turns[0].textContent).toContain("read_file");
      expect(turns[1].textContent).toContain("Thinking content unavailable");
      expect(turns[1].textContent).toContain("list_dir");
      expect(turns[2].textContent).toContain("Third reason");
      expect(
        container.querySelector(".final-response-container")?.textContent,
      ).toContain("Final answer");
    });

    it("keeps a completed turn with many tools compact until details are requested", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });
      const toolCalls = Array.from({ length: 65 }, (_, index) => ({
        id: `call-${index}`,
        name: "read_file",
        input: { path: `src/file-${index}.ts` },
        output: "ok",
        status: "completed" as const,
      }));

      chatView.renderMessages([
        {
          role: "assistant",
          thinking: "Inspecting files",
          content: "Done.",
          toolCalls,
        },
      ]);

      const execution = container.querySelector(
        ".execution-steps-card",
      ) as HTMLElement;
      execution.querySelector<HTMLElement>(".execution-card-header")?.click();
      const tools = container.querySelector(
        ".turn-tools-container",
      ) as HTMLElement;
      expect(
        execution.querySelector(".execution-stats")?.textContent,
      ).toContain("65 calls");
      expect(tools.classList.contains("expanded")).toBe(true);
      expect(tools.querySelectorAll(".tool-call-card")).toHaveLength(65);
      expect(
        tools.querySelector(".tool-call-card")?.classList.contains("expanded"),
      ).toBe(false);
      expect(tools.querySelector(".tool-status.completed")).toBeNull();

      tools.querySelector<HTMLElement>(".tool-call-header")?.click();
      expect(
        tools.querySelector(".tool-call-card")?.classList.contains("expanded"),
      ).toBe(true);
    });

    it("should handle tool permission approval buttons", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      chatView.renderPermissionPrompt({
        sessionId: "sess-1",
        requestId: "perm-1",
        toolTitle: "Execute Terminal Command",
        options: [
          { optionId: "opt-allow", name: "Allow Once", kind: "allow_once" },
          { optionId: "opt-deny", name: "Reject", kind: "reject_once" },
        ],
      });

      const allowBtn = container.querySelector<HTMLButtonElement>(
        '[data-option="opt-allow"]',
      );
      expect(allowBtn).not.toBeNull();
      allowBtn?.click();

      expect(onActionMock).toHaveBeenCalledWith({
        type: "RESPOND_PERMISSION",
        payload: {
          sessionId: "sess-1",
          requestId: "perm-1",
          decision: "allow",
          optionId: "opt-allow",
        },
      });
    });

    it("should render user message toolbar with fork button and dispatch FORK_SESSION with message index", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      chatView.setSessionId("sess-turn-1");
      chatView.renderMessages([
        { role: "user", content: "First prompt turn" },
        { role: "assistant", content: "Assistant turn 1" },
        { role: "user", content: "Second prompt turn" },
      ]);

      const userRows = container.querySelectorAll(".message-row.user");
      expect(userRows.length).toBe(2);

      // Verify second user message has fork button
      const forkBtn = userRows[1].querySelector(
        ".btn-msg-fork",
      ) as HTMLButtonElement;
      expect(forkBtn).not.toBeNull();
      expect(forkBtn.textContent).toContain("Fork");

      forkBtn.click();

      expect(onActionMock).toHaveBeenCalledWith({
        type: "FORK_SESSION",
        payload: {
          sourceSessionId: "sess-turn-1",
          options: {
            upToMessageIndex: 2,
          },
        },
      });
    });

    it("should hide central connect card when agent is running and show when stopped", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      // 1. When agent is stopped: welcome card is shown
      chatView.setAgentContext(
        [{ id: "agent-1", name: "My Agent", command: "test" }],
        { "agent-1": "stopped" },
        "agent-1",
      );
      chatView.renderMessages([]);
      expect(container.querySelector(".welcome-card")).not.toBeNull();

      // 2. When agent is running: welcome card is hidden
      chatView.setAgentContext(
        [{ id: "agent-1", name: "My Agent", command: "test" }],
        { "agent-1": "running" },
        "agent-1",
      );
      chatView.renderMessages([]);
      expect(container.querySelector(".welcome-card")).toBeNull();
    });

    it("should render streamlined messages without YOU/ASSISTANT labels, auto-collapse thought card when response arrives, and attach copy button to response", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      const messages: MessageChunk[] = [
        { role: "user", content: "Hello world" },
        {
          role: "assistant",
          thinking: "Analyzing user input...",
          toolCalls: [
            {
              id: "call-1",
              name: "search",
              input: { q: "query" },
              status: "completed",
            },
          ],
          content: "Here is the result.",
        },
      ];

      chatView.renderMessages(messages);

      const userRow = container.querySelector(
        ".message-row.user",
      ) as HTMLElement;
      expect(userRow).not.toBeNull();
      // No YOU icon/title label (画蛇添足)
      expect(userRow.querySelector(".user-badge")).toBeNull();
      expect(userRow.textContent).not.toContain("YOU");
      expect(userRow.textContent).not.toContain("You");

      const assistantRow = container.querySelector(
        ".message-row.assistant",
      ) as HTMLElement;
      expect(assistantRow).not.toBeNull();
      // No ASSISTANT icon/title label (画蛇添足)
      expect(assistantRow.querySelector(".assistant-badge")).toBeNull();
      expect(assistantRow.textContent).not.toContain("ASSISTANT");
      expect(assistantRow.textContent).not.toContain("Assistant");

      // Thought card: when response content exists, it must be auto-collapsed!
      const thoughtCard = assistantRow.querySelector(
        ".thought-card, .execution-steps-card",
      ) as HTMLElement;
      expect(thoughtCard).not.toBeNull();
      expect(thoughtCard.classList.contains("expanded")).toBe(false);

      // Copy response button must be inside final response container, attached to answer
      const finalContainer = assistantRow.querySelector(
        ".final-response-container",
      ) as HTMLElement;
      expect(finalContainer).not.toBeNull();
      const copyBtn = finalContainer.querySelector(
        ".btn-copy-response",
      ) as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      expect(copyBtn.textContent).toContain("Copy");

      // Test streaming auto-collapse
      const streamView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });
      streamView.renderMessages([]);
      // 1. Thinking chunk: card is expanded
      streamView.appendThinkingChunk("Reasoning about code...");
      const streamCard = container.querySelector(
        ".thought-card, .execution-steps-card",
      ) as HTMLElement;
      expect(streamCard.classList.contains("expanded")).toBe(true);

      // 2. Assistant response chunk arrives: card is auto-collapsed!
      streamView.appendAssistantChunk("First chunk of answer");
      expect(streamCard.classList.contains("expanded")).toBe(false);
    });
  });

  describe("T4: Context Compaction Timeline UI", () => {
    it("should render compaction banner with saved tokens and collapsible summary", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      chatView.setCompactions([
        {
          compactionId: "comp-1",
          id: "comp-1",
          status: "completed",
          startedAt: 1000,
          tokensBefore: 5000,
          tokensAfter: 1200,
          summary: "Summary of earlier discussion about architecture and setup.",
          messageIndex: 1,
        },
      ]);

      const messages: MessageChunk[] = [
        { role: "user", content: "Initial prompt" },
        { role: "assistant", content: "Initial response" },
      ];

      chatView.renderMessages(messages);

      const banner = container.querySelector(
        ".compaction-banner-row",
      ) as HTMLElement;
      expect(banner).not.toBeNull();
      expect(banner.dataset.compactionId).toBe("comp-1");
      expect(banner.textContent).toContain("Context Compacted");
      expect(banner.textContent).toContain("saved ~3800 tokens");

      // Collapsed by default
      const summaryBody = banner.querySelector(
        ".compaction-summary-body",
      ) as HTMLElement;
      expect(summaryBody.style.display).toBe("none");

      // Click header toggles expanded
      const header = banner.querySelector(".compaction-header") as HTMLElement;
      header.click();
      expect(summaryBody.style.display).toBe("block");
      expect(summaryBody.textContent).toContain("Summary of earlier discussion");

      header.click();
      expect(summaryBody.style.display).toBe("none");
    });

    it("should incrementally append compaction chunks during live compaction", () => {
      const chatView = new ChatViewComponent({
        container,
        onAction: onActionMock,
      });

      chatView.renderMessages([]);

      chatView.addCompaction({
        compactionId: "comp-stream",
        id: "comp-stream",
        status: "in_progress",
        startedAt: 2000,
        summary: "",
      });

      const banner = container.querySelector(
        '.compaction-banner-row[data-compaction-id="comp-stream"]',
      ) as HTMLElement;
      expect(banner).not.toBeNull();

      chatView.appendCompactionChunk({
        id: "comp-stream",
        text: "Compacted chunk 1. ",
      });
      chatView.appendCompactionChunk({
        id: "comp-stream",
        text: "Compacted chunk 2.",
      });

      const content = banner.querySelector(
        ".compaction-summary-content",
      ) as HTMLElement;
      expect(content).not.toBeNull();
      expect(content.textContent).toContain(
        "Compacted chunk 1. Compacted chunk 2.",
      );
    });
  });
});
