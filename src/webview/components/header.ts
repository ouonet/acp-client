/**
 * Top Header Component
 * Displays live Agent status indicator, model badge, thinking badge, and quick action controls.
 */

import type { WebviewStateSnapshot } from '../../shared/ipc-protocol';
import { ICONS } from './icons';

export interface HeaderComponentOptions {
  container: HTMLElement;
  onAction: (action: any) => void;
}

export class HeaderComponent {
  private readonly container: HTMLElement;
  private readonly onAction: (action: any) => void;
  private activeSessionId?: string;
  private currentAgentId?: string;

  constructor(options: HeaderComponentOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
    this.render();
  }

  public update(snapshot: WebviewStateSnapshot): void {
    const activeSession = snapshot.activeSession;
    this.activeSessionId = activeSession?.id;
    this.currentAgentId = activeSession?.agentId;

    const agentConfig = snapshot.agentConfigs.find((c) => c.id === activeSession?.agentId);
    const agentName = agentConfig?.name || activeSession?.agentId || 'No Agent';
    const status = (activeSession?.agentId && snapshot.processStatuses[activeSession.agentId]) || 'stopped';
    const isRunning = !!activeSession?.agentId && status === 'running';
    const model = isRunning && activeSession?.model ? activeSession.model : null;
    const thinking = isRunning && activeSession?.thinkingLevel ? activeSession.thinkingLevel : null;

    this.container.innerHTML = `
      <header class="acp-header">
        <div class="header-left">
          <div class="agent-status-pill">
            <span class="status-dot ${status}"></span>
            <span class="agent-name">${this.escapeHtml(agentName)}</span>
          </div>
        </div>
        <div class="header-center">
          ${model ? `<span class="model-badge">${this.escapeHtml(model)}</span>` : ''}
          ${thinking ? `<span class="thinking-badge">${this.escapeHtml(thinking)}</span>` : ''}
        </div>
        <div class="header-right">
          <button class="icon-btn" data-action="fork" title="Fork Session (Branch Conversation)">
            ${ICONS.fork}
          </button>
          <button class="icon-btn" data-action="toggle-config" title="Agent Settings">
            ${ICONS.settings}
          </button>
          <button class="icon-btn" data-action="toggle-history" title="History Drawer">
            ${ICONS.history}
          </button>
        </div>
      </header>
    `;

    this.bindEvents();
  }

  public updateProcessStatus(agentId: string, status: string): void {
    if (this.currentAgentId === agentId || !this.currentAgentId) {
      const dot = this.container.querySelector('.status-dot');
      if (dot) {
        dot.className = `status-dot ${status}`;
      }
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <header class="acp-header">
        <div class="header-left">
          <div class="agent-status-pill">
            <span class="status-dot stopped"></span>
            <span class="agent-name">Connecting...</span>
          </div>
        </div>
      </header>
    `;
  }

  private bindEvents(): void {
    const forkBtn = this.container.querySelector('[data-action="fork"]');
    forkBtn?.addEventListener('click', () => {
      if (this.activeSessionId) {
        this.onAction({
          type: 'FORK_SESSION',
          payload: { sourceSessionId: this.activeSessionId },
        });
      }
    });

    const configBtn = this.container.querySelector('[data-action="toggle-config"]');
    configBtn?.addEventListener('click', () => {
      this.onAction({ type: 'TOGGLE_CONFIG' });
    });

    const historyBtn = this.container.querySelector('[data-action="toggle-history"]');
    historyBtn?.addEventListener('click', () => {
      this.onAction({ type: 'TOGGLE_HISTORY' });
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
