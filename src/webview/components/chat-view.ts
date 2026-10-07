/**
 * Chat Stream View Component & Markdown Renderer
 * Renders user/assistant messages, incremental markdown, code blocks, thinking cards, and tool approval gates.
 */

import type {
  MessageChunk,
  ContentBlock,
  ToolCall,
  CompactionEntry,
} from "../../core/types/session";
import { DiffViewerComponent } from "./diff-viewer";
import { ICONS } from "./icons";
import { renderMarkdown } from "../utils/markdown-renderer";
export { renderMarkdown, tryFormatFileLink } from "../utils/markdown-renderer";
import mermaid from "mermaid";

try {
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
  });
} catch {
  // Ignore in headless / test environments
}

export interface ChatViewOptions {
  container: HTMLElement;
  onAction: (action: any) => void;
}

export interface PermissionPromptParams {
  sessionId: string;
  requestId: string;
  toolTitle: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: string;
  }>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatElapsed(start?: number, end?: number): string {
  if (start === undefined) return "";
  const seconds = Math.max(0, ((end ?? Date.now()) - start) / 1000);
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function formatToolValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

function toolPreview(value: unknown): string {
  return formatToolValue(value).replace(/\s+/g, " ").trim().slice(0, 140);
}

export class ChatViewComponent {
  private readonly container: HTMLElement;
  private readonly onAction: (action: any) => void;
  private currentAssistantBubble: HTMLElement | null = null;
  private currentThinkingContainer: HTMLElement | null = null;
  private currentRawContent = "";
  private snapshotFingerprint?: string;
  private currentSessionId?: string;
  private agentConfigs: any[] = [];
  private processStatuses: Record<string, string> = {};
  private activeAgentId?: string;
  private elapsedTimer?: ReturnType<typeof setInterval>;
  private compactions: CompactionEntry[] = [];

  private refreshElapsed(): void {
    this.container
      .querySelectorAll<HTMLElement>("[data-started-at]")
      .forEach((element) => {
        const start = Number(element.dataset.startedAt);
        const end = element.dataset.completedAt
          ? Number(element.dataset.completedAt)
          : undefined;
        const label = element.querySelector<HTMLElement>(
          ":scope > .execution-card-header .elapsed-time, :scope > .internal-turn-header .elapsed-time, :scope > .tool-call-header .elapsed-time",
        );
        if (label) label.textContent = formatElapsed(start, end);
      });
  }

  private ensureElapsedTimer(): void {
    if (this.elapsedTimer) return;
    this.elapsedTimer = setInterval(() => {
      this.refreshElapsed();
      if (
        !this.container.querySelector(
          ".execution-steps-card[data-started-at]:not([data-completed-at])",
        )
      ) {
        clearInterval(this.elapsedTimer);
        this.elapsedTimer = undefined;
      }
    }, 200);
  }

  public finishExecution(at: number = Date.now()): void {
    const row = this.container.querySelector(
      ".message-row.assistant:last-child",
    ) as HTMLElement | null;
    const card = row?.querySelector(
      ".execution-steps-card",
    ) as HTMLElement | null;
    if (!card || card.dataset.completedAt) return;
    card.dataset.completedAt = String(at);
    card.querySelector<HTMLElement>(".execution-title")!.textContent = "Worked";
    card.classList.remove("expanded");
    const icon = card.querySelector(".execution-card-header .toggle-icon");
    if (icon) icon.innerHTML = ICONS.chevronRight;
    const turns = card.querySelectorAll<HTMLElement>(".internal-turn-card");
    const lastTurn = turns[turns.length - 1];
    if (lastTurn && !lastTurn.dataset.completedAt)
      lastTurn.dataset.completedAt = String(at);
    this.refreshElapsed();
  }

  constructor(options: ChatViewOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
    this.bindGlobalEvents();
  }

  public setSessionId(id: string): void {
    if (id !== this.currentSessionId) this.snapshotFingerprint = undefined;
    this.currentSessionId = id;
  }

  public setCompactions(compactions: CompactionEntry[]): void {
    this.compactions = compactions ? [...compactions] : [];
  }

  public addCompaction(compaction: CompactionEntry): void {
    this.compactions.push(compaction);
    const banner = this.renderCompactionBanner(compaction);
    this.container.appendChild(banner);
    this.scrollToBottom();
  }

  public appendCompactionChunk(payload: { id?: string; text: string }): void {
    const text = payload.text || "";
    let compaction = payload.id
      ? this.compactions.find(
          (c) => c.compactionId === payload.id || c.id === payload.id,
        )
      : this.compactions[this.compactions.length - 1];

    if (!compaction) {
      const cid = payload.id || `compact-${Date.now()}`;
      compaction = {
        compactionId: cid,
        id: cid,
        status: "in_progress",
        startedAt: Date.now(),
        summary: "",
      };
      this.compactions.push(compaction);
      const banner = this.renderCompactionBanner(compaction);
      this.container.appendChild(banner);
    }

    compaction.summary = (compaction.summary || "") + text;
    const cid = compaction.compactionId || compaction.id || "";
    const banner = this.container.querySelector(
      `.compaction-banner-row[data-compaction-id="${cid}"]`,
    );
    if (banner) {
      let body = banner.querySelector(".compaction-summary-body") as HTMLElement;
      if (!body) {
        body = document.createElement("div");
        body.className = "compaction-summary-body";
        banner.querySelector(".compaction-banner")?.appendChild(body);
      }
      let content = body.querySelector(".compaction-summary-content");
      if (!content) {
        content = document.createElement("div");
        content.className = "compaction-summary-content";
        body.appendChild(content);
      }
      content.innerHTML = renderMarkdown(compaction.summary);
    }
  }

  public renderCompactionBanner(compaction: CompactionEntry): HTMLElement {
    const row = document.createElement("div");
    row.className = "compaction-banner-row";
    const cid = compaction.compactionId || compaction.id || "";
    row.dataset.compactionId = cid;

    let statsText = "";
    if (compaction.tokensBefore && compaction.tokensAfter) {
      const saved = Math.max(0, compaction.tokensBefore - compaction.tokensAfter);
      statsText = `· saved ~${saved} tokens`;
    }

    row.innerHTML = `
      <div class="compaction-banner">
        <div class="compaction-header" data-action="toggle-compaction">
          <div class="compaction-title-wrap">
            <span class="compaction-icon">${ICONS.bolt}</span>
            <span class="compaction-title">Context Compacted</span>
            ${statsText ? `<span class="compaction-stats">${escapeHtml(statsText)}</span>` : ""}
          </div>
          ${compaction.summary ? `<span class="toggle-icon">${ICONS.chevronRight}</span>` : ""}
        </div>
        ${
          compaction.summary
            ? `
          <div class="compaction-summary-body" style="display: none;">
            <div class="compaction-summary-content">${renderMarkdown(compaction.summary)}</div>
          </div>
        `
            : ""
        }
      </div>
    `;

    if (compaction.summary) {
      const header = row.querySelector(".compaction-header");
      const body = row.querySelector(".compaction-summary-body") as HTMLElement;
      const icon = row.querySelector(".toggle-icon");
      header?.addEventListener("click", () => {
        const isCollapsed = body.style.display === "none";
        body.style.display = isCollapsed ? "block" : "none";
        if (icon) {
          icon.innerHTML = isCollapsed ? ICONS.chevronDown : ICONS.chevronRight;
        }
        row.querySelector(".compaction-banner")?.classList.toggle("expanded", isCollapsed);
      });
    }

    return row;
  }

  public setAgentContext(
    configs: any[],
    statuses: Record<string, string>,
    activeAgentId?: string,
  ): void {
    this.agentConfigs = configs || [];
    this.processStatuses = statuses || {};
    this.activeAgentId = activeAgentId;
  }

  public reconcileMessages(
    messages: MessageChunk[],
    preserveStream: boolean,
  ): void {
    const fingerprint = JSON.stringify(messages);
    if (preserveStream && fingerprint === this.snapshotFingerprint) return;
    const next = structuredClone(messages);
    const last = next[next.length - 1];
    if (
      preserveStream &&
      this.snapshotFingerprint !== undefined &&
      last?.role === "assistant" &&
      typeof last.content === "string" &&
      this.currentRawContent.startsWith(last.content)
    )
      last.content = this.currentRawContent;
    this.snapshotFingerprint = fingerprint;
    this.setMessages(next);
  }

  public setPendingPermission(params?: PermissionPromptParams): void {
    this.container
      .querySelectorAll(".tool-approval-card")
      .forEach((card) => card.remove());
    if (params) this.renderPermissionPrompt(params);
  }

  public setMessages(messages: MessageChunk[]): void {
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
    this.currentAssistantBubble = null;
    this.currentThinkingContainer = null;
    this.currentRawContent = "";
    this.renderMessages(messages);
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      this.currentAssistantBubble = this.container.querySelector(
        ".message-row.assistant:last-child .final-response-container .message-bubble",
      );
      this.currentRawContent =
        typeof last.content === "string"
          ? last.content
          : Array.isArray(last.content)
            ? last.content
                .filter((block) => block.type === "text")
                .map((block) => (block as { text: string }).text)
                .join("")
            : "";
    }
  }

  private getAgentName(id?: string): string {
    if (!id) return "Agent";
    const cfg = this.agentConfigs.find((c) => c.id === id);
    return cfg?.name || id;
  }

  private getOrCreateAssistantRow(): HTMLElement {
    let row = this.container.querySelector(
      ".message-row.assistant:last-child",
    ) as HTMLElement;
    if (!row) {
      row = document.createElement("div");
      row.className = "message-row assistant";
      this.container.appendChild(row);
    }
    const indicator = row.querySelector(".streaming-indicator");
    if (indicator) {
      indicator.remove();
    }
    return row;
  }

  private getOrCreateExecutionCard(
    row: HTMLElement,
    isRunning: boolean = true,
  ): HTMLElement {
    let execCard = row.querySelector(".execution-steps-card") as HTMLElement;
    if (!execCard) {
      execCard = this.createExecutionCard(1, 0, isRunning);
      execCard.dataset.startedAt = String(Date.now());
      this.ensureElapsedTimer();
      const finalContainer = row.querySelector(".final-response-container");
      if (finalContainer) {
        row.insertBefore(execCard, finalContainer);
      } else {
        row.appendChild(execCard);
      }
    } else if (isRunning) {
      execCard.classList.add("expanded");
      const icon = execCard.querySelector(
        ".execution-card-header .toggle-icon",
      );
      if (icon) {
        icon.innerHTML = ICONS.chevronDown;
      }
      if (!execCard.dataset.completedAt) {
        const title = execCard.querySelector(".execution-title");
        if (title) title.textContent = "Working";
      }
    }
    return execCard;
  }

  private getOrCreateInternalTurnCard(
    execCard: HTMLElement,
    turnIndex: number = 1,
  ): HTMLElement {
    const body = execCard.querySelector(".execution-card-body") as HTMLElement;
    let turnCard = body.querySelector(
      `.internal-turn-card[data-internal-turn="${turnIndex}"]`,
    ) as HTMLElement;
    if (!turnCard) {
      turnCard = this.createInternalTurnCard(turnIndex);
      const previous = body.querySelector<HTMLElement>(
        ".internal-turn-card:last-child",
      );
      if (previous?.dataset.startedAt && !previous.dataset.completedAt) {
        previous.dataset.completedAt = String(Date.now());
      }
      body.appendChild(turnCard);
    }
    return turnCard;
  }

  private updateExecutionStats(execCard: HTMLElement): void {
    const turns = execCard.querySelectorAll(".internal-turn-card").length;
    const tools = execCard.querySelectorAll(".tool-call-card").length;
    const statsEl = execCard.querySelector(".execution-stats");
    if (statsEl) {
      statsEl.textContent = `· ${turns} ${turns === 1 ? "turn" : "turns"} · ${tools} ${tools === 1 ? "call" : "calls"}`;
    }
  }

  private createExecutionCard(
    turnCount: number = 1,
    toolCount: number = 0,
    isRunning: boolean = false,
  ): HTMLElement {
    const card = document.createElement("div");
    card.className = `execution-steps-card thought-card ${isRunning ? "expanded" : ""}`;
    const titleText = isRunning ? "Working" : "Worked";
    card.innerHTML = `
      <div class="execution-card-header" data-action="toggle-execution">
        <span class="toggle-icon">${isRunning ? ICONS.chevronDown : ICONS.chevronRight}</span>
        <span class="execution-title-wrap">
          ${ICONS.brain}
          <span class="execution-title">${titleText}</span>
          <span class="elapsed-time"></span>
          <span class="execution-stats">· ${turnCount} ${turnCount === 1 ? "turn" : "turns"} · ${toolCount} ${toolCount === 1 ? "call" : "calls"}</span>
        </span>
      </div>
      <div class="execution-card-body"></div>
    `;

    const header = card.querySelector(".execution-card-header") as HTMLElement;
    header?.addEventListener("click", () => {
      const isExpanded = card.classList.toggle("expanded");
      const icon = card.querySelector(".execution-card-header .toggle-icon");
      if (icon) {
        icon.innerHTML = isExpanded ? ICONS.chevronDown : ICONS.chevronRight;
      }
    });

    return card;
  }

  private createInternalTurnCard(
    turnIndex: number,
    title?: string,
  ): HTMLElement {
    const card = document.createElement("div");
    card.className = "internal-turn-card expanded";
    card.setAttribute("data-internal-turn", String(turnIndex));
    const turnTitle = title || "Thinking content unavailable";
    card.innerHTML = `
      <div class="internal-turn-header" data-action="toggle-internal-turn">
        <span class="toggle-icon">${ICONS.chevronDown}</span>
        <span class="internal-turn-title">${escapeHtml(turnTitle)}</span>
        <span class="elapsed-time"></span>
      </div>
      <div class="internal-turn-body"></div>
    `;

    const header = card.querySelector(".internal-turn-header") as HTMLElement;
    header?.addEventListener("click", () => {
      const isExpanded = card.classList.toggle("expanded");
      const icon = card.querySelector(".internal-turn-header .toggle-icon");
      if (icon) {
        icon.innerHTML = isExpanded ? ICONS.chevronDown : ICONS.chevronRight;
      }
    });

    return card;
  }

  public appendAssistantChunk(chunk: string): void {
    const row = this.getOrCreateAssistantRow();
    const execCard = row.querySelector(
      ".execution-steps-card, .thought-card",
    ) as HTMLElement;
    if (execCard) this.finishExecution();

    if (!this.currentAssistantBubble) {
      let finalContainer = row.querySelector(
        ".final-response-container",
      ) as HTMLElement;
      if (!finalContainer) {
        finalContainer = document.createElement("div");
        finalContainer.className = "final-response-container";
        this.currentAssistantBubble = document.createElement("div");
        this.currentAssistantBubble.className =
          "message-bubble message-content";
        finalContainer.appendChild(this.currentAssistantBubble);

        const actionsBar = document.createElement("div");
        actionsBar.className = "response-actions-bar";
        actionsBar.innerHTML = `
          <button class="response-action-btn btn-copy-response" type="button" title="Copy response">
            ${ICONS.copy} <span>Copy</span>
          </button>
        `;
        actionsBar
          .querySelector(".btn-copy-response")
          ?.addEventListener("click", () => {
            navigator.clipboard?.writeText(this.currentRawContent);
            const btn = actionsBar.querySelector(".btn-copy-response");
            if (btn) {
              btn.innerHTML = `${ICONS.check} <span>Copied!</span>`;
              setTimeout(() => {
                btn.innerHTML = `${ICONS.copy} <span>Copy</span>`;
              }, 1500);
            }
          });
        finalContainer.appendChild(actionsBar);
        row.appendChild(finalContainer);
      } else {
        this.currentAssistantBubble = finalContainer.querySelector(
          ".message-bubble",
        ) as HTMLElement;
      }
    }

    this.currentRawContent += chunk;
    this.currentAssistantBubble.innerHTML = renderMarkdown(
      this.currentRawContent,
    );
    this.renderDynamicDiagrams();
    this.scrollToBottom();
  }

  public appendThinkingChunk(
    thinking: string,
    turnIndex: number = 1,
    startedAt?: number,
    messageStartedAt?: number,
  ): void {
    const row = this.getOrCreateAssistantRow();
    const execCard = this.getOrCreateExecutionCard(row, true);
    if (messageStartedAt) execCard.dataset.startedAt = String(messageStartedAt);
    const turnCard = this.getOrCreateInternalTurnCard(execCard, turnIndex);
    if (!turnCard.dataset.startedAt)
      turnCard.dataset.startedAt = String(startedAt ?? Date.now());
    const title = turnCard.querySelector<HTMLElement>(".internal-turn-title");
    if (title && thinking) {
      title.textContent =
        (title.dataset.hasThinking ? title.textContent : "") + thinking;
      title.dataset.hasThinking = "true";
    }
    this.updateExecutionStats(execCard);
    this.refreshElapsed();
    this.ensureElapsedTimer();
    this.scrollToBottom();
  }

  public appendToolCall(
    tc: ToolCall,
    turnIndex: number = 1,
    messageStartedAt?: number,
  ): void {
    const row = this.getOrCreateAssistantRow();
    const execCard = this.getOrCreateExecutionCard(row, true);
    const turnCard = this.getOrCreateInternalTurnCard(execCard, turnIndex);
    const turnBody = turnCard.querySelector(
      ".internal-turn-body",
    ) as HTMLElement;

    let toolsContainer = turnBody.querySelector(
      ".turn-tools-container",
    ) as HTMLElement;
    if (!toolsContainer) {
      toolsContainer = document.createElement("div");
      toolsContainer.className = "turn-tools-container expanded";
      toolsContainer.innerHTML = '<div class="turn-tools-list"></div>';
      turnBody.appendChild(toolsContainer);
    }

    const toolsList = toolsContainer.querySelector(
      ".turn-tools-list",
    ) as HTMLElement;
    const el = this.createToolCallElement(tc);
    toolsList.appendChild(el);

    if (tc.startedAt && !turnCard.dataset.startedAt)
      turnCard.dataset.startedAt = String(tc.startedAt);
    if (messageStartedAt) execCard.dataset.startedAt = String(messageStartedAt);
    this.updateExecutionStats(execCard);
    this.refreshElapsed();
    this.ensureElapsedTimer();
    this.scrollToBottom();
  }

  public updateToolResult(
    id: string,
    output: any,
    status: string = "running",
    input?: any,
    name?: string,
    completedAt?: number,
  ): void {
    const card = Array.from(
      this.container.querySelectorAll<HTMLElement>(".tool-call-card"),
    ).find((item) => item.dataset.toolId === id);
    if (!card) return;
    card.className = `tool-call-card ${status}${card.classList.contains("expanded") ? " expanded" : ""}`;
    let statusSpan = card.querySelector<HTMLElement>(".tool-status");
    if (status === "completed") statusSpan?.remove();
    else {
      if (!statusSpan) {
        statusSpan = document.createElement("span");
        card.querySelector(".tool-call-header")?.appendChild(statusSpan);
      }
      statusSpan.textContent = status;
      statusSpan.className = `tool-status ${status}`;
    }
    if (name) card.querySelector<HTMLElement>(".tool-name")!.textContent = name;
    if (input !== undefined) {
      card.querySelector<HTMLElement>(".tool-input-preview")!.textContent =
        toolPreview(input);
      const section = card.querySelector<HTMLElement>(".tool-input-section");
      if (section) {
        section.style.display = "";
        section.querySelector<HTMLElement>("code")!.textContent =
          formatToolValue(input);
      }
    }
    if (output !== undefined) {
      card.querySelector<HTMLElement>(".tool-output-preview")!.textContent =
        toolPreview(output);
      const section = card.querySelector<HTMLElement>(".tool-output-section");
      if (section) {
        section.style.display = "";
        section.querySelector<HTMLElement>("code")!.textContent =
          formatToolValue(output);
      }
    }
    if (completedAt || ["completed", "failed", "denied"].includes(status)) {
      card.dataset.completedAt = String(completedAt ?? Date.now());
    }
    this.refreshElapsed();
  }

  public handlePermissionRequest(params: PermissionPromptParams): void {
    this.renderPermissionPrompt(params);
  }

  public renderMessages(messages: MessageChunk[]): void {
    this.container.innerHTML = "";

    if (messages.length === 0) {
      if (this.compactions.length > 0) {
        for (const c of this.compactions) {
          this.container.appendChild(this.renderCompactionBanner(c));
        }
        return;
      }

      const isRunning =
        !!this.activeAgentId &&
        this.processStatuses[this.activeAgentId] === "running";
      if (isRunning) {
        return;
      }

      const welcome = document.createElement("div");
      welcome.className = "chat-welcome-container";
      welcome.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-icon-glow">${ICONS.bolt}</div>
          <h2 class="welcome-title">Connect an ACP Agent</h2>
          <p class="welcome-subtitle">
            Select an Agent from your configurations to establish an interactive pair-programming session.
          </p>
          ${
            !isRunning && this.agentConfigs.length > 0
              ? `
            <div class="welcome-actions-row">
              <div class="welcome-select-wrapper">
                <select class="welcome-agent-select">
                  ${this.agentConfigs.map((c) => `<option value="${c.id}" ${c.id === this.activeAgentId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
                </select>
                <span class="select-chevron">${ICONS.chevronDown}</span>
              </div>
              <button class="btn-welcome-connect" type="button">
                ${ICONS.bolt} <span>Connect Agent</span>
              </button>
            </div>
          `
              : ""
          }
          ${
            !isRunning && this.agentConfigs.length === 0
              ? `
            <button class="btn-welcome-config" type="button">
              ${ICONS.settings} <span>Configure New Agent</span>
            </button>
          `
              : ""
          }
          <div class="welcome-hints">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${ICONS.lightbulb} <span><strong>Tip:</strong> Press <code>/</code> in the input box for skills (/tdd, /review, /design, /plan)</span></span>
            <button class="btn-link-output" type="button" style="display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none; color: var(--accent-color); cursor: pointer; font-size: 11px; padding: 2px 0;">
              ${ICONS.terminal} <span>View Output Logs</span>
            </button>
          </div>
        </div>
      `;

      welcome
        .querySelector(".btn-welcome-connect")
        ?.addEventListener("click", () => {
          const sel = welcome.querySelector(
            ".welcome-agent-select",
          ) as HTMLSelectElement;
          const agentId =
            sel?.value || this.activeAgentId || this.agentConfigs[0]?.id;
          if (!agentId) {
            this.onAction({ type: "TOGGLE_CONFIG" });
            return;
          }
          this.onAction({
            type: "CONNECT_AGENT",
            payload: { agentId },
          });
        });

      welcome
        .querySelector(".btn-welcome-config")
        ?.addEventListener("click", () => {
          this.onAction({ type: "TOGGLE_CONFIG" });
        });

      welcome
        .querySelector(".btn-link-output")
        ?.addEventListener("click", () => {
          this.onAction({ type: "SHOW_OUTPUT" });
        });

      this.container.appendChild(welcome);
      return;
    }

    const compactionsByIndex = new Map<number, CompactionEntry[]>();
    for (const c of this.compactions) {
      const idx = c.messageIndex ?? 0;
      if (!compactionsByIndex.has(idx)) {
        compactionsByIndex.set(idx, []);
      }
      compactionsByIndex.get(idx)!.push(c);
    }

    for (let idx = 0; idx < messages.length; idx++) {
      const compactionsBefore = compactionsByIndex.get(idx);
      if (compactionsBefore) {
        for (const c of compactionsBefore) {
          this.container.appendChild(this.renderCompactionBanner(c));
        }
      }

      const msg = messages[idx];
      const row = document.createElement("div");
      row.className = `message-row ${msg.role}`;
      row.setAttribute("data-msg-index", String(idx));

      if (msg.role === "user") {
        const userActions = document.createElement("div");
        userActions.className = "user-message-actions";
        userActions.innerHTML = `
          <button class="turn-action-btn btn-msg-fork" type="button" title="Fork from this message" data-index="${idx}">
            ${ICONS.fork} <span>Fork</span>
          </button>
          <button class="turn-action-btn btn-msg-copy" type="button" title="Copy prompt text">
            ${ICONS.copy}
          </button>
        `;

        const userText =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter((b) => b.type === "text")
                  .map((b) => (b as any).text)
                  .join("")
              : "";

        userActions
          .querySelector(".btn-msg-fork")
          ?.addEventListener("click", () => {
            if (this.currentSessionId) {
              this.onAction({
                type: "FORK_SESSION",
                payload: {
                  sourceSessionId: this.currentSessionId,
                  options: {
                    upToMessageIndex: idx,
                  },
                },
              });
            }
          });

        userActions
          .querySelector(".btn-msg-copy")
          ?.addEventListener("click", () => {
            navigator.clipboard?.writeText(userText);
            const copyBtn = userActions.querySelector(".btn-msg-copy");
            if (copyBtn) {
              copyBtn.innerHTML = "Copied!";
              setTimeout(() => {
                copyBtn.innerHTML = ICONS.copy;
              }, 1500);
            }
          });

        row.appendChild(userActions);

        const bubble = document.createElement("div");
        bubble.className = "message-bubble message-content";
        if (typeof msg.content === "string") {
          bubble.innerHTML = renderMarkdown(msg.content);
        } else if (Array.isArray(msg.content)) {
          bubble.innerHTML = this.renderContentBlocks(msg.content);
        }
        row.appendChild(bubble);
      } else if (msg.role === "assistant") {
        // Preserve persisted turn boundaries; older sessions use the flat fields.
        const legacyToolCalls = Array.isArray(msg.toolCalls)
          ? msg.toolCalls
          : [];
        const turns = msg.turns?.length
          ? msg.turns
          : msg.thinking || legacyToolCalls.length > 0
            ? [{ thinking: msg.thinking, toolCalls: legacyToolCalls }]
            : [];
        const isDone = !!msg.content || msg.completedAt !== undefined;
        if (turns.length > 0) {
          const toolCount = turns.reduce(
            (count, turn) => count + turn.toolCalls.length,
            0,
          );
          const execCard = this.createExecutionCard(
            turns.length,
            toolCount,
            !isDone,
          );
          if (msg.startedAt !== undefined)
            execCard.dataset.startedAt = String(msg.startedAt);
          if (msg.completedAt !== undefined)
            execCard.dataset.completedAt = String(msg.completedAt);
          if (isDone) {
            execCard.classList.remove("expanded");
            const icon = execCard.querySelector(".toggle-icon");
            if (icon) {
              icon.innerHTML = ICONS.chevronRight;
            }
          }
          for (const [turnOffset, turn] of turns.entries()) {
            const turnNumber = turnOffset + 1;
            const turnCard = this.createInternalTurnCard(
              turnNumber,
              turn.thinking || "Thinking content unavailable",
            );
            if (turn.startedAt !== undefined)
              turnCard.dataset.startedAt = String(turn.startedAt);
            if (turn.completedAt !== undefined)
              turnCard.dataset.completedAt = String(turn.completedAt);
            const turnBody = turnCard.querySelector(
              ".internal-turn-body",
            ) as HTMLElement;

            if (turn.toolCalls.length > 0) {
              const toolsContainer = document.createElement("div");
              toolsContainer.className = "turn-tools-container expanded";
              toolsContainer.innerHTML = '<div class="turn-tools-list"></div>';
              const toolsList = toolsContainer.querySelector(
                ".turn-tools-list",
              ) as HTMLElement;
              for (const tc of turn.toolCalls) {
                toolsList.appendChild(this.createToolCallElement(tc));
              }
              turnBody.appendChild(toolsContainer);
            }

            execCard
              .querySelector(".execution-card-body")
              ?.appendChild(turnCard);
          }
          row.appendChild(execCard);
        }

        // Final Response Block (below execution card)
        if (msg.content) {
          const finalContainer = document.createElement("div");
          finalContainer.className = "final-response-container";
          const bubble = document.createElement("div");
          bubble.className = "message-bubble message-content";
          const assistantText =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .filter((b) => b.type === "text")
                    .map((b) => (b as any).text)
                    .join("")
                : "";
          if (typeof msg.content === "string") {
            bubble.innerHTML = renderMarkdown(msg.content);
          } else if (Array.isArray(msg.content)) {
            bubble.innerHTML = this.renderContentBlocks(msg.content);
          }
          finalContainer.appendChild(bubble);

          const actionsBar = document.createElement("div");
          actionsBar.className = "response-actions-bar";
          actionsBar.innerHTML = `
            <button class="response-action-btn btn-copy-response" type="button" title="Copy response">
              ${ICONS.copy} <span>Copy</span>
            </button>
          `;
          actionsBar
            .querySelector(".btn-copy-response")
            ?.addEventListener("click", () => {
              navigator.clipboard?.writeText(assistantText);
              const btn = actionsBar.querySelector(".btn-copy-response");
              if (btn) {
                btn.innerHTML = `${ICONS.check} <span>Copied!</span>`;
                setTimeout(() => {
                  btn.innerHTML = `${ICONS.copy} <span>Copy</span>`;
                }, 1500);
              }
            });
          finalContainer.appendChild(actionsBar);
          row.appendChild(finalContainer);
        } else if (turns.length === 0) {
          if (idx === messages.length - 1) {
            const ind = document.createElement("div");
            ind.className = "streaming-indicator";
            ind.innerHTML = `
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              <span style="font-size: 11px; color: var(--fg-muted); margin-left: 6px;">Thinking...</span>
            `;
            row.appendChild(ind);
          }
        }
      } else if (msg.role === "system") {
        const card = document.createElement("div");
        card.className = "system-message-card";
        const textContent =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        card.innerHTML = `
          <div class="system-icon">${ICONS.alert}</div>
          <div class="system-content">${renderMarkdown(textContent)}</div>
        `;
        row.appendChild(card);
      }

      this.container.appendChild(row);
    }

    for (const [idx, compactions] of compactionsByIndex.entries()) {
      if (idx >= messages.length) {
        for (const c of compactions) {
          this.container.appendChild(this.renderCompactionBanner(c));
        }
      }
    }

    this.refreshElapsed();
    if (
      this.container.querySelector(
        ".execution-steps-card[data-started-at]:not([data-completed-at])",
      )
    )
      this.ensureElapsedTimer();
    this.renderDynamicDiagrams();
    this.scrollToBottom();
  }

  private renderDynamicDiagrams(): void {
    const wrappers = this.container.querySelectorAll<HTMLElement>(
      ".mermaid-diagram-wrapper:not([data-rendered='true'])",
    );
    wrappers.forEach(async (wrapper, i) => {
      wrapper.setAttribute("data-rendered", "true");
      const code = wrapper.getAttribute("data-mermaid-code");
      const svgContainer = wrapper.querySelector(".mermaid-svg-container");
      if (code && svgContainer) {
        try {
          const id = `mermaid-svg-${Date.now()}-${i}`;
          const { svg } = await mermaid.render(id, code);
          svgContainer.innerHTML = svg;
        } catch {
          // Keep raw text on render failure or in headless environments
        }
      }
    });
  }

  public renderPermissionPrompt(params: PermissionPromptParams): void {
    const card = document.createElement("div");
    this.container
      .querySelectorAll(".tool-approval-card")
      .forEach((existing) => existing.remove());
    card.className = "tool-approval-card";
    card.style.cssText =
      "border: 1px solid var(--accent-color); background: rgba(137, 180, 250, 0.08); padding: 12px; border-radius: var(--radius-md); margin: 10px 0;";

    const optionsHtml = params.options
      .map(
        (opt) =>
          `<button class="btn-perm-action code-action-btn" data-option="${opt.optionId}" style="margin-right: 8px; font-weight: 600;">${escapeHtml(
            opt.name,
          )}</button>`,
      )
      .join("");

    card.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
        ${ICONS.lock}
        <span>Permission Required</span>
      </div>
      <div style="font-size: 12px; color: var(--fg-muted); margin-bottom: 10px;">
        Tool: <strong>${escapeHtml(params.toolTitle)}</strong>
      </div>
      <div class="perm-options-row">
        ${optionsHtml}
      </div>
    `;

    for (const opt of params.options) {
      const btn = card.querySelector(`[data-option="${opt.optionId}"]`);
      btn?.addEventListener("click", () => {
        let decision: "allow" | "deny" | "always_allow_session";
        if (
          opt.kind === "allow_always" ||
          opt.optionId.includes("always") ||
          opt.name.includes("Always")
        ) {
          decision = "always_allow_session";
        } else if (opt.kind.startsWith("allow")) {
          decision = "allow";
        } else {
          decision = "deny";
        }

        this.onAction({
          type: "RESPOND_PERMISSION",
          payload: {
            sessionId: params.sessionId,
            requestId: params.requestId,
            decision,
            optionId: opt.optionId,
          },
        });
        card.remove();
      });
    }

    this.container.appendChild(card);
    this.scrollToBottom();
  }

  public scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }

  private renderContentBlocks(blocks: ContentBlock[]): string {
    return blocks
      .map((b) => {
        if (b.type === "text") {
          return renderMarkdown(b.text);
        } else if (b.type === "image") {
          return `<div class="msg-image-wrap"><img src="data:${b.mimeType};base64,${b.data}" class="msg-image" style="max-width: 100%; border-radius: 6px; margin: 4px 0;" /></div>`;
        }
        return "";
      })
      .join("");
  }

  private createToolCallElement(tc: ToolCall): HTMLElement {
    const card = document.createElement("div");
    card.className = `tool-call-card ${tc.status}`;
    card.setAttribute("data-tool-id", tc.id);
    if (tc.startedAt !== undefined)
      card.dataset.startedAt = String(tc.startedAt);
    if (tc.completedAt !== undefined)
      card.dataset.completedAt = String(tc.completedAt);

    const formattedInput = formatToolValue(tc.input);
    const formattedOutput = formatToolValue(tc.output);

    const isDiff = tc.input && (tc.input.diff || tc.input.patch);

    card.innerHTML = `
      <div class="tool-call-header" data-action="toggle-tool">
        <div class="tool-header-left">
          <span class="toggle-icon">${ICONS.chevronRight}</span>
          <span class="tool-icon">${ICONS.tool}</span>
          <span class="tool-name">${escapeHtml(tc.name)}</span>
          <span class="tool-input-preview">${escapeHtml(toolPreview(tc.input))}</span>
          <span class="tool-output-preview">${escapeHtml(toolPreview(tc.output))}</span>
        </div>
        <span class="elapsed-time">${formatElapsed(tc.startedAt, tc.completedAt)}</span>
        ${tc.status === "completed" ? "" : `<span class="tool-status ${tc.status}">${escapeHtml(tc.status)}</span>`}
      </div>
      <div class="tool-call-body">
        <div class="tool-section tool-input-section" style="${formattedInput ? "" : "display: none;"}">
          <div class="tool-section-label">Input Parameters</div>
          <pre class="tool-params-pre"><code>${escapeHtml(formattedInput)}</code></pre>
        </div>
        <div class="tool-section tool-output-section" style="${formattedOutput ? "" : "display: none;"}">
          <div class="tool-section-label">Result</div>
          <pre class="tool-output-pre"><code>${escapeHtml(formattedOutput)}</code></pre>
        </div>
      </div>
    `;

    const body = card.querySelector(".tool-call-body") as HTMLElement | null;
    if (body) {
      body.style.display = card.classList.contains("expanded")
        ? "block"
        : "none";
    }

    if (isDiff) {
      const diffContainer = document.createElement("div");
      diffContainer.className = "tool-diff-container";
      new DiffViewerComponent({
        container: diffContainer,
        filePath: tc.input.filePath || tc.input.path || "diff",
        diff: tc.input.diff || tc.input.patch,
        originalContent: tc.input.originalContent,
        modifiedContent: tc.input.modifiedContent ?? tc.input.content,
        onApply: (filePath, content, originalContent) => {
          this.onAction({
            type: "APPLY_FILE_DIFF",
            payload: { filePath, content, originalContent },
          });
        },
        onOpenDiff: (filePath, originalContent, modifiedContent) => {
          this.onAction({
            type: "OPEN_DIFF_EDITOR",
            payload: { filePath, originalContent, modifiedContent },
          });
        },
      });
      card.querySelector(".tool-call-body")?.prepend(diffContainer);
    }

    const header = card.querySelector(".tool-call-header") as HTMLElement;
    header?.addEventListener("click", () => {
      const isExpanded = card.classList.toggle("expanded");
      if (body) {
        body.style.display = isExpanded ? "block" : "none";
      }
      const icon = card.querySelector(".tool-call-header .toggle-icon");
      if (icon) {
        icon.innerHTML = isExpanded ? ICONS.chevronDown : ICONS.chevronRight;
      }
    });

    return card;
  }

  private bindGlobalEvents(): void {
    this.container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      const fileLink = target.closest(".file-path-link") as HTMLElement;
      if (fileLink) {
        e.preventDefault();
        e.stopPropagation();
        const filePath = fileLink.getAttribute("data-path") || "";
        const startLineStr = fileLink.getAttribute("data-start-line");
        const endLineStr = fileLink.getAttribute("data-end-line");
        const startLine = startLineStr ? parseInt(startLineStr, 10) : undefined;
        const endLine = endLineStr ? parseInt(endLineStr, 10) : undefined;
        if (filePath) {
          this.onAction({
            type: "OPEN_FILE",
            payload: {
              filePath,
              startLine,
              endLine,
            },
          });
        }
        return;
      }

      if (target && target.closest('[data-action="copy-code"]')) {
        const btn = target.closest('[data-action="copy-code"]') as HTMLElement;
        const wrapper = btn.closest(
          ".code-block-wrapper, .mermaid-diagram-wrapper, .plantuml-diagram-wrapper",
        );
        const codeEl = wrapper?.querySelector("code");
        const textToCopy =
          wrapper?.getAttribute("data-mermaid-code") ||
          wrapper?.getAttribute("data-plantuml-code") ||
          codeEl?.textContent ||
          "";
        if (textToCopy) {
          navigator.clipboard?.writeText(textToCopy);
          const originalText = btn.innerHTML;
          btn.innerHTML = `${ICONS.check || ""} <span>Copied!</span>`;
          setTimeout(() => {
            btn.innerHTML = originalText;
          }, 1500);
        }
      }
    });
  }
}
