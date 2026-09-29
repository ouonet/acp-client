/**
 * HistoryDrawerComponent: Session history browsing, search filter, and forking
 */

import type { SessionSummary } from '../../core/types/session';
import type { WebviewAction } from '../../shared/ipc-protocol';
import { ICONS } from './icons';

export interface HistoryDrawerOptions {
  container: HTMLElement;
  sessions: SessionSummary[];
  activeSessionId?: string;
  onAction: (action: WebviewAction) => void;
  onClose: () => void;
}

export class HistoryDrawerComponent {
  private container: HTMLElement;
  private options: HistoryDrawerOptions;
  private sessions: SessionSummary[];
  private activeSessionId?: string;
  private searchQuery = '';

  constructor(options: HistoryDrawerOptions) {
    this.container = options.container;
    this.options = options;
    this.sessions = options.sessions ? [...options.sessions] : [];
    this.activeSessionId = options.activeSessionId;

    this.render();
  }

  public setSessions(sessions: SessionSummary[], activeId?: string): void {
    this.sessions = [...sessions];
    if (activeId !== undefined) {
      this.activeSessionId = activeId;
    }
    this.render();
  }

  public setActiveSessionId(id: string): void {
    this.activeSessionId = id;
    this.render();
  }

  private getFilteredSessions(): SessionSummary[] {
    if (!this.searchQuery) return this.sessions;
    const q = this.searchQuery.toLowerCase();
    return this.sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.agentId.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  }

  private formatTime(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  }

  private render(): void {
    const filtered = this.getFilteredSessions();

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title">${ICONS.history} <span>Session History (${this.sessions.length})</span></div>
        <button class="drawer-close-btn" type="button" title="Close Drawer">${ICONS.close}</button>
      </div>
      <div class="drawer-body">
        <div class="history-search-bar">
          <input
            type="text"
            class="history-search-input form-input"
            placeholder="Search sessions..."
            value="${this.searchQuery}"
          />
        </div>
        <div class="history-session-list">
          ${
            filtered.length === 0
              ? `<div class="history-empty">No sessions found</div>`
              : filtered
                  .map(
                    (s) => `
              <div
                class="history-session-item ${s.id === this.activeSessionId ? 'active' : ''}"
                data-session-id="${s.id}"
              >
                <div class="history-item-main">
                  <div class="history-item-title-row">
                    <span class="history-item-title">${s.title}</span>
                    <span class="history-item-time">${this.formatTime(s.updatedAt)}</span>
                  </div>
                  <div class="history-item-meta">
                    <span class="meta-badge agent-badge">${s.agentId}</span>
                    <span class="meta-badge msg-count">${s.messageCount} msgs</span>
                    ${
                      s.parentSessionId
                        ? `<span class="meta-badge fork-lineage">${ICONS.fork} <span>Forked</span></span>`
                        : ''
                    }
                  </div>
                </div>
                <div class="history-item-actions">
                  <button
                    class="btn-session-fork"
                    type="button"
                    data-session-id="${s.id}"
                    title="Fork this session"
                  >${ICONS.fork} <span>Fork</span></button>
                  <button
                    class="btn-session-delete"
                    type="button"
                    data-session-id="${s.id}"
                    title="Delete session"
                  >${ICONS.trash}</button>
                </div>
              </div>
            `
                  )
                  .join('')
          }
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Close button
    this.container.querySelector('.drawer-close-btn')?.addEventListener('click', () => {
      this.options.onClose();
    });

    // Search input
    const searchInput = this.container.querySelector('.history-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.render();
      // Keep focus on search input after render
      const freshSearch = this.container.querySelector('.history-search-input') as HTMLInputElement;
      if (freshSearch) {
        freshSearch.focus();
        freshSearch.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
      }
    });

    // Session Item Click (Switch)
    const sessionCards = this.container.querySelectorAll('.history-session-item');
    sessionCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        // Prevent click if clicking action button
        if ((e.target as HTMLElement).closest('.history-item-actions')) {
          return;
        }
        const sid = (card as HTMLElement).getAttribute('data-session-id');
        if (sid) {
          this.options.onAction({
            type: 'SWITCH_SESSION',
            payload: {
              sessionId: sid,
            },
          });
          this.options.onClose();
        }
      });
    });

    // Fork Buttons
    const forkBtns = this.container.querySelectorAll('.btn-session-fork');
    forkBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sid = (btn as HTMLElement).getAttribute('data-session-id');
        if (sid) {
          this.options.onAction({
            type: 'FORK_SESSION',
            payload: {
              sourceSessionId: sid,
            },
          });
          this.options.onClose();
        }
      });
    });

    // Delete Buttons
    const deleteBtns = this.container.querySelectorAll('.btn-session-delete');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sid = (btn as HTMLElement).getAttribute('data-session-id');
        if (sid) {
          this.sessions = this.sessions.filter((s) => s.id !== sid);
          this.options.onAction({
            type: 'DELETE_SESSION',
            payload: {
              sessionId: sid,
            },
          });
          this.render();
        }
      });
    });
  }
}
