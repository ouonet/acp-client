/**
 * Top Header Component
 * Displays live Agent status indicator, model badge, thinking badge, and quick action controls.
 */

import type { WebviewStateSnapshot } from "../../shared/ipc-protocol";
import { ICONS } from "./icons";

export interface HeaderComponentOptions {
  container: HTMLElement;
  onAction: (action: any) => void;
}

export class HeaderComponent {
  private readonly container: HTMLElement;
  private readonly onAction: (action: any) => void;
  private activeSessionId?: string;
  private currentAgentId?: string;
  private lastSnapshot?: WebviewStateSnapshot;

  constructor(options: HeaderComponentOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
    this.render();
  }

  public update(snapshot: WebviewStateSnapshot): void {
    const activeSession = snapshot.activeSession;
    if (this.activeSessionId !== activeSession?.id)
      this.currentAgentId = activeSession?.agentId;
    this.activeSessionId = activeSession?.id;
    this.lastSnapshot = snapshot;

    const hasConfigs =
      snapshot.agentConfigs && snapshot.agentConfigs.length > 0;
    const currentAgent =
      snapshot.agentConfigs.find((c) => c.id === this.currentAgentId) ||
      snapshot.agentConfigs[0];
    if (currentAgent) {
      this.currentAgentId = currentAgent.id;
    } else {
      this.currentAgentId = undefined;
    }
    const status =
      (this.currentAgentId && snapshot.processStatuses[this.currentAgentId]) ||
      "stopped";
    const isRunning = !!this.currentAgentId && status === "running";
    const isStarting = !!this.currentAgentId && status === "starting";

    this.container.innerHTML = `
      <header class="acp-header">
        <div class="header-left">
          ${
            hasConfigs
              ? `
            <div class="agent-selector-wrapper">
              <span class="status-dot ${status}"></span>
              <select class="header-agent-select agent-name" title="Select ACP Agent">
                ${snapshot.agentConfigs
                  .map(
                    (c) => `
                  <option value="${c.id}" ${c.id === this.currentAgentId ? "selected" : ""}>
                    ${this.escapeHtml(c.name)}
                  </option>
                `,
                  )
                  .join("")}
                <option value="__configure__">+ Configure Agents...</option>
              </select>
              <span class="select-chevron">${ICONS.chevronDown}</span>
            </div>
            <button
              class="btn-agent-connection ${isRunning ? "connected" : "disconnected"}"
              data-action="${isRunning ? "disconnect-agent" : "connect-agent"}"
              data-agent-id="${this.currentAgentId || ""}"
              type="button"
              title="${isRunning ? "Disconnect / Stop Agent Process" : "Connect to Agent"}"
            >
              ${isRunning ? `${ICONS.stop} <span>Disconnect</span>` : isStarting ? `${ICONS.spinner} <span>Connecting...</span>` : `${ICONS.bolt} <span>Connect</span>`}
            </button>
          `
              : `
            <div class="agent-status-pill">
              <span class="status-dot stopped"></span>
              <span class="agent-name">No Agent</span>
            </div>
            <button class="btn-agent-connection disconnected" data-action="toggle-config" type="button" title="Configure Agent">
              ${ICONS.settings} <span>Add Agent</span>
            </button>
          `
          }
        </div>
        <div class="header-right">
          <button class="icon-btn" data-action="new-session" title="New Session">
            ${ICONS.plus}
          </button>
          <button class="icon-btn" data-action="show-output" title="View ACP Output Channel Logs">
            ${ICONS.terminal}
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

  public getSelectedAgentId(): string | undefined {
    return this.currentAgentId;
  }

  public updateProcessStatus(agentId: string, status: string): void {
    if (this.currentAgentId === agentId || !this.currentAgentId) {
      const dot = this.container.querySelector(".status-dot");
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
            <span class="agent-name">No Agent</span>
          </div>
        </div>
      </header>
    `;
  }

  private bindEvents(): void {
    const agentSelect = this.container.querySelector(
      "select.header-agent-select",
    ) as HTMLSelectElement;
    agentSelect?.addEventListener("change", () => {
      const val = agentSelect.value;
      if (val === "__configure__") {
        this.onAction({ type: "TOGGLE_CONFIG" });
      } else if (val) {
        this.currentAgentId = val;
        if (this.lastSnapshot) this.update(this.lastSnapshot);
      }
    });

    const connBtn = this.container.querySelector(
      ".btn-agent-connection",
    ) as HTMLButtonElement;
    connBtn?.addEventListener("click", () => {
      const action = connBtn.getAttribute("data-action");
      if (action === "connect-agent") {
        const agentId = this.currentAgentId;
        if (!agentId) {
          this.onAction({ type: "TOGGLE_CONFIG" });
          return;
        }
        this.onAction({
          type: "CONNECT_AGENT",
          payload: { agentId },
        });
      } else if (action === "disconnect-agent") {
        if (this.currentAgentId) {
          this.onAction({
            type: "STOP_AGENT_PROCESS",
            payload: { agentId: this.currentAgentId },
          });
        }
      } else if (action === "toggle-config") {
        this.onAction({ type: "TOGGLE_CONFIG" });
      }
    });

    const newSessionBtn = this.container.querySelector(
      '[data-action="new-session"]',
    );
    newSessionBtn?.addEventListener("click", () => {
      if (this.currentAgentId) {
        this.onAction({
          type: "CREATE_SESSION",
          payload: { agentId: this.currentAgentId, title: "New Session" },
        });
      } else {
        this.onAction({ type: "TOGGLE_CONFIG" });
      }
    });

    const outputBtn = this.container.querySelector(
      '[data-action="show-output"]',
    );
    outputBtn?.addEventListener("click", () => {
      this.onAction({ type: "SHOW_OUTPUT" });
    });

    const configBtn = this.container.querySelector(
      '.header-right [data-action="toggle-config"]',
    );
    configBtn?.addEventListener("click", () => {
      this.onAction({ type: "TOGGLE_CONFIG" });
    });

    const historyBtn = this.container.querySelector(
      '[data-action="toggle-history"]',
    );
    historyBtn?.addEventListener("click", () => {
      this.onAction({ type: "TOGGLE_HISTORY" });
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
