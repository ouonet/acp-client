/**
 * ConfigPanelComponent: Visual Agent Configuration and Connection Diagnostics Drawer
 */

import type { AgentConfig } from '../../core/types/config';
import type { WebviewAction } from '../../shared/ipc-protocol';

export interface TestResultData {
  success: boolean;
  protocolVersion?: number;
  capabilities?: any;
  error?: string;
  durationMs: number;
}

export interface ConfigPanelOptions {
  container: HTMLElement;
  configs: AgentConfig[];
  activeAgentId?: string;
  onAction: (action: WebviewAction) => void;
  onClose: () => void;
}

export class ConfigPanelComponent {
  private container: HTMLElement;
  private options: ConfigPanelOptions;
  private configs: AgentConfig[];
  private activeConfigId: string;
  private pingResultBox: HTMLElement | null = null;

  constructor(options: ConfigPanelOptions) {
    this.container = options.container;
    this.options = options;
    this.configs = options.configs && options.configs.length > 0
      ? [...options.configs]
      : [
          {
            id: 'default-agent',
            name: 'Default Agent',
            transport: 'stdio',
            command: 'npx',
            args: ['@agentclientprotocol/claude-agent-acp'],
          },
        ];
    this.activeConfigId = options.activeAgentId || this.configs[0].id;

    this.render();
  }

  public setConfigs(configs: AgentConfig[], activeId?: string): void {
    this.configs = [...configs];
    if (activeId) {
      this.activeConfigId = activeId;
    } else if (!this.configs.some((c) => c.id === this.activeConfigId)) {
      this.activeConfigId = this.configs[0]?.id || '';
    }
    this.render();
  }

  public showTestResult(result: TestResultData): void {
    if (!this.pingResultBox) return;

    if (result.success) {
      this.pingResultBox.className = 'ping-result success';
      this.pingResultBox.innerHTML = `
        <span class="status-indicator">●</span>
        <strong>Connected (${result.durationMs}ms)</strong>
        ${result.protocolVersion ? `<span>Protocol v${result.protocolVersion}</span>` : ''}
      `;
    } else {
      this.pingResultBox.className = 'ping-result error';
      this.pingResultBox.innerHTML = `
        <span class="status-indicator">🔴</span>
        <strong>Connection Failed (${result.durationMs}ms)</strong>
        <div class="ping-error-detail">${result.error || 'Unknown error'}</div>
      `;
    }
  }

  private getCurrentConfig(): AgentConfig {
    const found = this.configs.find((c) => c.id === this.activeConfigId);
    return (
      found || {
        id: this.activeConfigId || 'custom-agent',
        name: 'New Agent',
        transport: 'stdio',
        command: '',
        args: [],
      }
    );
  }

  private readFormConfig(): AgentConfig {
    const current = this.getCurrentConfig();
    const nameInput = this.container.querySelector('input[name="name"]') as HTMLInputElement;
    const transportSelect = this.container.querySelector('select[name="transport"]') as HTMLSelectElement;
    const commandInput = this.container.querySelector('input[name="command"]') as HTMLInputElement;
    const argsInput = this.container.querySelector('input[name="args"]') as HTMLInputElement;
    const cwdInput = this.container.querySelector('input[name="cwd"]') as HTMLInputElement;

    const env: Record<string, string> = {};
    const envRows = this.container.querySelectorAll('.env-row');
    envRows.forEach((row) => {
      const keyInput = row.querySelector('.env-key') as HTMLInputElement;
      const valInput = row.querySelector('.env-val') as HTMLInputElement;
      if (keyInput && valInput && keyInput.value.trim()) {
        env[keyInput.value.trim()] = valInput.value;
      }
    });

    const autoApprove: string[] = [];
    const permBoxes = this.container.querySelectorAll('input[name="autoApprove"]:checked');
    permBoxes.forEach((box) => {
      autoApprove.push((box as HTMLInputElement).value);
    });

    return {
      ...current,
      name: nameInput?.value || current.name,
      transport: (transportSelect?.value as 'stdio' | 'websocket') || current.transport,
      command: commandInput?.value || '',
      args: argsInput?.value ? argsInput.value.split(',').map((s) => s.trim()).filter(Boolean) : [],
      cwd: cwdInput?.value ? cwdInput.value.trim() : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      autoApprove: autoApprove.length > 0 ? autoApprove : undefined,
    };
  }

  private render(): void {
    const config = this.getCurrentConfig();

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title">⚙ Agent Configuration</div>
        <button class="drawer-close-btn" type="button" title="Close Panel">✕</button>
      </div>
      <div class="drawer-body">
        <div class="agent-tabs-bar">
          ${this.configs
            .map(
              (c) => `
            <button
              class="agent-tab-btn ${c.id === this.activeConfigId ? 'active' : ''}"
              type="button"
              data-agent-id="${c.id}"
            >${c.name}</button>
          `
            )
            .join('')}
          <button class="agent-tab-btn add-new-agent" type="button">+ Add</button>
        </div>

        <form class="config-form" onsubmit="return false;">
          <div class="form-group">
            <label>Agent Name</label>
            <input type="text" name="name" class="form-input" value="${config.name || ''}" placeholder="e.g. Claude Code CLI" />
          </div>

          <div class="form-group">
            <label>Transport</label>
            <select name="transport" class="form-select">
              <option value="stdio" ${config.transport === 'stdio' ? 'selected' : ''}>Stdio JSON-RPC</option>
              <option value="websocket" ${config.transport === 'websocket' ? 'selected' : ''}>WebSocket Remote</option>
            </select>
          </div>

          <div class="form-group">
            <label>Command</label>
            <input type="text" name="command" class="form-input" value="${config.command || ''}" placeholder="e.g. npx" />
          </div>

          <div class="form-group">
            <label>Arguments (comma-separated)</label>
            <input type="text" name="args" class="form-input" value="${(config.args || []).join(', ')}" placeholder="e.g. @agentclientprotocol/claude-agent-acp, --verbose" />
          </div>

          <div class="form-group">
            <label>Working Directory</label>
            <input type="text" name="cwd" class="form-input" value="${config.cwd || ''}" placeholder="e.g. \${workspaceFolder}" />
          </div>

          <div class="form-group">
            <label>Environment Variables</label>
            <div class="env-table">
              ${Object.entries(config.env || {})
                .map(
                  ([k, v]) => `
                <div class="env-row">
                  <input type="text" class="env-key form-input" value="${k}" placeholder="Key" />
                  <input type="password" class="env-val form-input" value="${v}" placeholder="Value" />
                  <button type="button" class="btn-delete-env">🗑</button>
                </div>
              `
                )
                .join('')}
            </div>
            <button type="button" class="btn-add-env">+ Add Env Var</button>
          </div>

          <div class="form-group">
            <label>Security & Auto-Approve Permissions</label>
            <div class="checkbox-group">
              <label class="checkbox-label">
                <input type="checkbox" name="autoApprove" value="read_file" ${(config.autoApprove || []).includes('read_file') ? 'checked' : ''} />
                Auto-allow file reading
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="autoApprove" value="write_file" ${(config.autoApprove || []).includes('write_file') ? 'checked' : ''} />
                Auto-allow file writing
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="autoApprove" value="execute_command" ${(config.autoApprove || []).includes('execute_command') ? 'checked' : ''} />
                Auto-allow terminal execution
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-ping">⚡ Test Connection (Ping)</button>
            <button type="button" class="btn-save-config">💾 Save Config</button>
            ${
              this.configs.length > 1
                ? `<button type="button" class="btn-delete-config">🗑 Delete Agent</button>`
                : ''
            }
          </div>

          <div class="ping-result"></div>
        </form>
      </div>
    `;

    this.pingResultBox = this.container.querySelector('.ping-result');

    this.bindEvents();
  }

  private bindEvents(): void {
    // Close Drawer
    const closeBtn = this.container.querySelector('.drawer-close-btn');
    closeBtn?.addEventListener('click', () => {
      this.options.onClose();
    });

    // Agent Tabs
    const tabBtns = this.container.querySelectorAll('.agent-tab-btn:not(.add-new-agent)');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-agent-id');
        if (id && id !== this.activeConfigId) {
          this.activeConfigId = id;
          this.render();
        }
      });
    });

    // Add Agent Tab
    const addBtn = this.container.querySelector('.agent-tab-btn.add-new-agent');
    addBtn?.addEventListener('click', () => {
      const newId = `agent-${Date.now().toString(36)}`;
      const newConfig: AgentConfig = {
        id: newId,
        name: 'New ACP Agent',
        transport: 'stdio',
        command: '',
        args: [],
      };
      this.configs.push(newConfig);
      this.activeConfigId = newId;
      this.render();
    });

    // Add Env Var
    const addEnvBtn = this.container.querySelector('.btn-add-env');
    addEnvBtn?.addEventListener('click', () => {
      const envTable = this.container.querySelector('.env-table');
      if (envTable) {
        const row = document.createElement('div');
        row.className = 'env-row';
        row.innerHTML = `
          <input type="text" class="env-key form-input" placeholder="Key" />
          <input type="text" class="env-val form-input" placeholder="Value" />
          <button type="button" class="btn-delete-env">🗑</button>
        `;
        row.querySelector('.btn-delete-env')?.addEventListener('click', () => {
          row.remove();
        });
        envTable.appendChild(row);
      }
    });

    // Delete Env Row
    const deleteEnvBtns = this.container.querySelectorAll('.btn-delete-env');
    deleteEnvBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        (btn.closest('.env-row') as HTMLElement)?.remove();
      });
    });

    // Test Connection (Ping)
    const pingBtn = this.container.querySelector('.btn-ping');
    pingBtn?.addEventListener('click', () => {
      const updated = this.readFormConfig();
      if (this.pingResultBox) {
        this.pingResultBox.className = 'ping-result testing';
        this.pingResultBox.innerHTML = `<span>⏳ Probing Agent process...</span>`;
      }
      this.options.onAction({
        type: 'TEST_AGENT_CONNECTION',
        payload: {
          config: updated,
        },
      });
    });

    // Save Config
    const saveBtn = this.container.querySelector('.btn-save-config');
    saveBtn?.addEventListener('click', () => {
      const updated = this.readFormConfig();
      const idx = this.configs.findIndex((c) => c.id === updated.id);
      if (idx >= 0) {
        this.configs[idx] = updated;
      } else {
        this.configs.push(updated);
      }
      this.options.onAction({
        type: 'SAVE_AGENT_CONFIG',
        payload: {
          config: updated,
        },
      });
    });

    // Delete Agent
    const deleteBtn = this.container.querySelector('.btn-delete-config');
    deleteBtn?.addEventListener('click', () => {
      const idToDelete = this.activeConfigId;
      this.configs = this.configs.filter((c) => c.id !== idToDelete);
      this.activeConfigId = this.configs[0]?.id || '';
      this.options.onAction({
        type: 'DELETE_AGENT_CONFIG',
        payload: {
          agentId: idToDelete,
        },
      });
      this.render();
    });
  }
}
