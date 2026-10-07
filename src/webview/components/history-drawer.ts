/**
 * HistoryDrawerComponent: Session history browsing, search filter, and forking
 */

import type { SessionSummary } from "../../core/types/session";
import type { WebviewAction } from "../../shared/ipc-protocol";
import { ICONS } from "./icons";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface HistoryDrawerOptions {
  container: HTMLElement;
  sessions: SessionSummary[];
  activeSessionId?: string;
  currentAgentId?: string;
  agentName?: string;
  isAgentRunning?: boolean;
  onAction: (action: WebviewAction) => void;
  onClose: () => void;
}

export class HistoryDrawerComponent {
  private container: HTMLElement;
  private options: HistoryDrawerOptions;
  private sessions: SessionSummary[];
  private activeSessionId?: string;
  private currentAgentId?: string;
  private agentName?: string;
  private isAgentRunning = false;
  private searchQuery = "";
  private isComposing = false;

  constructor(options: HistoryDrawerOptions) {
    this.container = options.container;
    this.options = options;
    this.sessions = options.sessions ? [...options.sessions] : [];
    this.activeSessionId = options.activeSessionId;
    this.currentAgentId = options.currentAgentId;
    this.agentName = options.agentName;
    this.isAgentRunning = !!options.isAgentRunning;

    this.render();
    this.bindDelegatedEvents();
  }

  public setSessions(
    sessions: SessionSummary[],
    activeId?: string,
    context?: {
      currentAgentId?: string;
      agentName?: string;
      isRunning?: boolean;
    },
  ): void {
    this.sessions = [...sessions];
    if (activeId !== undefined) {
      this.activeSessionId = activeId;
    }
    if (context) {
      this.currentAgentId = context.currentAgentId;
      this.agentName = context.agentName;
      this.isAgentRunning = !!context.isRunning;
    }

    if (this.container.querySelector(".history-search-input")) {
      this.updateFilteredList();
    } else {
      this.render();
    }
  }

  public setActiveSessionId(id: string): void {
    this.activeSessionId = id;
    if (this.container.querySelector(".history-search-input")) {
      this.updateFilteredList();
    } else {
      this.render();
    }
  }

  private getFilteredSessions(): SessionSummary[] {
    const list = this.sessions;
    if (!this.searchQuery) return list;
    const q = this.searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.agentId.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }

  private formatTime(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays}d ago`;
  }

  private getHeaderTitle(count: number): string {
    const base = "Local Saved Sessions";
    return `${base} (${count})`;
  }

  private render(): void {
    const filtered = this.getFilteredSessions();
    const titleText = this.getHeaderTitle(filtered.length);

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title">${ICONS.history} <span>${escapeHtml(titleText)}</span></div>
        <button class="drawer-close-btn" type="button" title="Close Drawer">${ICONS.close}</button>
      </div>
      <div class="drawer-body">
        <div class="history-search-bar">
          <input
            type="text"
            class="history-search-input form-input"
            placeholder="Search sessions..."
            value="${escapeHtml(this.searchQuery)}"
          />
        </div>
        <button class="btn-new-session" type="button" title="Start New Session">
          ${ICONS.plus} <span>New Session</span>
        </button>
        <div class="history-session-list"></div>
      </div>
    `;

    this.bindSearchEvents();
    this.renderSessionItems(filtered);
  }

  private updateFilteredList(): void {
    const filtered = this.getFilteredSessions();
    const titleSpan = this.container.querySelector(".drawer-title span");
    if (titleSpan) {
      titleSpan.textContent = this.getHeaderTitle(filtered.length);
    }
    this.renderSessionItems(filtered);
  }

  private renderSessionItems(filtered: SessionSummary[]): void {
    const listEl = this.container.querySelector(".history-session-list");
    if (!listEl) return;

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="history-empty">No sessions found</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map(
        (s) => `
      <div
        class="history-session-item ${s.id === this.activeSessionId ? "active" : ""}"
        data-session-id="${escapeHtml(s.id)}"
      >
        <div class="history-item-main">
          <div class="history-item-title-row">
            <span class="history-item-title">${escapeHtml(s.title)}</span>
            <span class="history-item-time">${this.formatTime(s.updatedAt)}</span>
          </div>
          <div class="history-item-meta">
            <span class="meta-badge agent-badge">${escapeHtml(s.agentId)}</span>
            <span class="meta-badge msg-count">${s.messageCount} msgs</span>
            ${
              s.parentSessionId
                ? `<span class="meta-badge fork-lineage">${ICONS.fork} <span>Forked</span></span>`
                : ""
            }
          </div>
        </div>
        <div class="history-item-actions">
          <button
            class="btn-session-fork"
            type="button"
            data-session-id="${escapeHtml(s.id)}"
            title="Fork this session"
          >${ICONS.fork} <span>Fork</span></button>
          <button
            class="btn-session-delete"
            type="button"
            data-session-id="${escapeHtml(s.id)}"
            title="Delete session"
          >${ICONS.trash}</button>
        </div>
      </div>
    `,
      )
      .join("");
  }

  private bindSearchEvents(): void {
    const searchInput = this.container.querySelector(
      ".history-search-input",
    ) as HTMLInputElement;
    if (!searchInput) return;

    // Handle IME composition (e.g. Chinese, Japanese input)
    searchInput.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });

    searchInput.addEventListener("compositionend", () => {
      this.isComposing = false;
      this.searchQuery = searchInput.value;
      this.updateFilteredList();
    });

    searchInput.addEventListener("input", (event) => {
      // Avoid filtering while the IME is still composing a candidate.
      if (this.isComposing || (event as InputEvent).isComposing) return;
      this.searchQuery = searchInput.value;
      this.updateFilteredList();
    });
  }

  private bindDelegatedEvents(): void {
    this.container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      // Close button
      if (target.closest(".drawer-close-btn")) {
        this.options.onClose();
        return;
      }

      // New Session button
      if (target.closest(".btn-new-session")) {
        this.options.onAction({
          type: "CREATE_SESSION",
          payload: {
            agentId: this.currentAgentId || "",
            title: "New Session",
          },
        });
        this.options.onClose();
        return;
      }

      // Fork button
      const forkBtn = target.closest(".btn-session-fork") as HTMLElement;
      if (forkBtn) {
        const sid = forkBtn.getAttribute("data-session-id");
        if (sid) {
          this.options.onAction({
            type: "FORK_SESSION",
            payload: {
              sourceSessionId: sid,
            },
          });
          this.options.onClose();
        }
        return;
      }

      // Delete button
      const deleteBtn = target.closest(".btn-session-delete") as HTMLElement;
      if (deleteBtn) {
        const sid = deleteBtn.getAttribute("data-session-id");
        if (sid) {
          this.sessions = this.sessions.filter((s) => s.id !== sid);
          this.options.onAction({
            type: "DELETE_SESSION",
            payload: {
              sessionId: sid,
            },
          });
          this.updateFilteredList();
        }
        return;
      }

      // Session Item Click (Switch)
      const sessionCard = target.closest(
        ".history-session-item",
      ) as HTMLElement;
      if (sessionCard && !target.closest(".history-item-actions")) {
        const sid = sessionCard.getAttribute("data-session-id");
        if (sid) {
          this.options.onAction({
            type: "SWITCH_SESSION",
            payload: {
              sessionId: sid,
            },
          });
          this.options.onClose();
        }
      }
    });
  }
}
