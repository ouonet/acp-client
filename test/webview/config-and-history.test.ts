// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigPanelComponent } from '../../src/webview/components/config-panel';
import { HistoryDrawerComponent } from '../../src/webview/components/history-drawer';
import type { AgentConfig } from '../../src/core/types/config';
import type { SessionSummary } from '../../src/core/types/session';

describe('T6: ConfigPanelComponent & HistoryDrawerComponent', () => {
  let configContainer: HTMLElement;
  let historyContainer: HTMLElement;

  const sampleAgentConfig: AgentConfig = {
    id: 'claude-code',
    name: 'Claude Code CLI',
    transport: 'stdio',
    command: 'npx',
    args: ['@agentclientprotocol/claude-agent-acp'],
    env: { ANTHROPIC_API_KEY: 'test-key' },
    enabled: true,
    autoApprove: ['read_file'],
  };

  const sampleSessions: SessionSummary[] = [
    {
      id: 'session-1',
      agentId: 'claude-code',
      title: 'Refactor Auth Architecture',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 1800000,
      status: 'idle',
      messageCount: 5,
    },
    {
      id: 'session-2',
      agentId: 'claude-code',
      title: 'Zustand State Investigation',
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 80000000,
      status: 'idle',
      messageCount: 12,
      parentSessionId: 'session-1',
    },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="config-drawer" class="drawer-overlay"></div>
      <div id="history-drawer" class="drawer-overlay"></div>
    `;
    configContainer = document.getElementById('config-drawer') as HTMLElement;
    historyContainer = document.getElementById('history-drawer') as HTMLElement;
  });

  describe('ConfigPanelComponent', () => {
    it('should render agent configurations and details form', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new ConfigPanelComponent({
        container: configContainer,
        configs: [sampleAgentConfig],
        activeAgentId: 'claude-code',
        onAction,
        onClose,
      });

      expect(configContainer.querySelector('.drawer-header')?.textContent).toContain('Agent Configuration');
      const nameInput = configContainer.querySelector('input[name="name"]') as HTMLInputElement;
      expect(nameInput.value).toBe('Claude Code CLI');
      const cmdInput = configContainer.querySelector('input[name="command"]') as HTMLInputElement;
      expect(cmdInput.value).toBe('npx');
    });

    it('should dispatch TEST_AGENT_CONNECTION action when Ping button is clicked and display result', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      const panel = new ConfigPanelComponent({
        container: configContainer,
        configs: [sampleAgentConfig],
        activeAgentId: 'claude-code',
        onAction,
        onClose,
      });

      const pingBtn = configContainer.querySelector('.btn-ping') as HTMLButtonElement;
      expect(pingBtn).not.toBeNull();
      pingBtn.click();

      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TEST_AGENT_CONNECTION',
          payload: {
            config: expect.objectContaining({
              id: 'claude-code',
              command: 'npx',
            }),
          },
        })
      );

      // Display ping result
      panel.showTestResult({
        success: true,
        protocolVersion: 1,
        durationMs: 42,
      });

      const resultBox = configContainer.querySelector('.ping-result') as HTMLElement;
      expect(resultBox.textContent).toContain('Connected (42ms)');
      expect(resultBox.textContent).toContain('Protocol v1');
    });

    it('should dispatch SAVE_AGENT_CONFIG when Save button is clicked', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new ConfigPanelComponent({
        container: configContainer,
        configs: [sampleAgentConfig],
        activeAgentId: 'claude-code',
        onAction,
        onClose,
      });

      const nameInput = configContainer.querySelector('input[name="name"]') as HTMLInputElement;
      nameInput.value = 'Updated Agent Name';

      const saveBtn = configContainer.querySelector('.btn-save-config') as HTMLButtonElement;
      saveBtn.click();

      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SAVE_AGENT_CONFIG',
          payload: {
            config: expect.objectContaining({
              id: 'claude-code',
              name: 'Updated Agent Name',
            }),
          },
        })
      );
    });

    it('should close drawer when close button is clicked', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new ConfigPanelComponent({
        container: configContainer,
        configs: [sampleAgentConfig],
        activeAgentId: 'claude-code',
        onAction,
        onClose,
      });

      const closeBtn = configContainer.querySelector('.drawer-close-btn') as HTMLElement;
      closeBtn.click();

      expect(onClose).toHaveBeenCalled();
    });

    it('should render professional SVG icons instead of emojis', () => {
      const panel = new ConfigPanelComponent({
        container: configContainer,
        configs: [sampleAgentConfig, { ...sampleAgentConfig, id: 'agent-2', name: 'Agent 2' }],
        activeAgentId: 'claude-code',
        onAction: vi.fn(),
        onClose: vi.fn(),
      });

      // Header title and close button
      const header = configContainer.querySelector('.drawer-header') as HTMLElement;
      expect(header.querySelector('.svg-icon')).not.toBeNull();
      expect(header.textContent).not.toContain('⚙');
      expect(header.textContent).not.toContain('✕');

      // Buttons
      const pingBtn = configContainer.querySelector('.btn-ping') as HTMLElement;
      expect(pingBtn.querySelector('.svg-icon')).not.toBeNull();
      expect(pingBtn.textContent).not.toContain('⚡');

      const saveBtn = configContainer.querySelector('.btn-save-config') as HTMLElement;
      expect(saveBtn.querySelector('.svg-icon')).not.toBeNull();
      expect(saveBtn.textContent).not.toContain('💾');

      const deleteBtn = configContainer.querySelector('.btn-delete-config') as HTMLElement;
      expect(deleteBtn.querySelector('.svg-icon')).not.toBeNull();
      expect(deleteBtn.textContent).not.toContain('🗑');

      const deleteEnvBtn = configContainer.querySelector('.btn-delete-env') as HTMLElement;
      expect(deleteEnvBtn.querySelector('.svg-icon')).not.toBeNull();
      expect(deleteEnvBtn.textContent).not.toContain('🗑');

      // Error result
      panel.showTestResult({ success: false, durationMs: 50, error: 'Failed' });
      const errorBox = configContainer.querySelector('.ping-result') as HTMLElement;
      expect(errorBox.textContent).not.toContain('🔴');
    });
  });

  describe('HistoryDrawerComponent', () => {
    it('should render list of sessions and highlight active session', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new HistoryDrawerComponent({
        container: historyContainer,
        sessions: sampleSessions,
        activeSessionId: 'session-1',
        onAction,
        onClose,
      });

      expect(historyContainer.querySelector('.drawer-header')?.textContent).toContain('Session History');
      const items = historyContainer.querySelectorAll('.history-session-item');
      expect(items.length).toBe(2);

      expect(items[0].classList.contains('active')).toBe(true);
      expect(items[0].textContent).toContain('Refactor Auth Architecture');
      expect(items[0].textContent).toContain('5 msgs');

      // Check forked lineage indicator on session-2
      expect(items[1].textContent).toContain('Forked');
    });

    it('should switch session when a session card is clicked', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new HistoryDrawerComponent({
        container: historyContainer,
        sessions: sampleSessions,
        activeSessionId: 'session-1',
        onAction,
        onClose,
      });

      const items = historyContainer.querySelectorAll('.history-session-item');
      (items[1] as HTMLElement).click();

      expect(onAction).toHaveBeenCalledWith({
        type: 'SWITCH_SESSION',
        payload: {
          sessionId: 'session-2',
        },
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('should dispatch FORK_SESSION when Fork button is clicked on session item', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new HistoryDrawerComponent({
        container: historyContainer,
        sessions: sampleSessions,
        activeSessionId: 'session-1',
        onAction,
        onClose,
      });

      const forkBtn = historyContainer.querySelector('.btn-session-fork') as HTMLElement;
      forkBtn.click();

      expect(onAction).toHaveBeenCalledWith({
        type: 'FORK_SESSION',
        payload: {
          sourceSessionId: 'session-1',
        },
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('should dispatch DELETE_SESSION when Delete button is clicked', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new HistoryDrawerComponent({
        container: historyContainer,
        sessions: sampleSessions,
        activeSessionId: 'session-1',
        onAction,
        onClose,
      });

      const deleteBtn = historyContainer.querySelector('.btn-session-delete') as HTMLElement;
      deleteBtn.click();

      expect(onAction).toHaveBeenCalledWith({
        type: 'DELETE_SESSION',
        payload: {
          sessionId: 'session-1',
        },
      });
    });

    it('should filter sessions by title query', () => {
      const onAction = vi.fn();
      const onClose = vi.fn();

      new HistoryDrawerComponent({
        container: historyContainer,
        sessions: sampleSessions,
        activeSessionId: 'session-1',
        onAction,
        onClose,
      });

      const searchInput = historyContainer.querySelector('.history-search-input') as HTMLInputElement;
      searchInput.value = 'Zustand';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const filteredItems = historyContainer.querySelectorAll('.history-session-item');
      expect(filteredItems.length).toBe(1);
      expect(filteredItems[0].textContent).toContain('Zustand State Investigation');
    });

    it('should render professional SVG icons instead of emojis', () => {
      new HistoryDrawerComponent({
        container: historyContainer,
        sessions: sampleSessions,
        activeSessionId: 'session-1',
        onAction: vi.fn(),
        onClose: vi.fn(),
      });

      // Header title and close button
      const header = historyContainer.querySelector('.drawer-header') as HTMLElement;
      expect(header.querySelector('.svg-icon')).not.toBeNull();
      expect(header.textContent).not.toContain('🕒');
      expect(header.textContent).not.toContain('✕');

      // Fork lineage badge and action buttons
      const forkBadge = historyContainer.querySelector('.fork-lineage') as HTMLElement;
      expect(forkBadge.querySelector('.svg-icon')).not.toBeNull();
      expect(forkBadge.textContent).not.toContain('🔀');

      const forkBtn = historyContainer.querySelector('.btn-session-fork') as HTMLElement;
      expect(forkBtn.querySelector('.svg-icon')).not.toBeNull();
      expect(forkBtn.textContent).not.toContain('🔀');

      const deleteBtn = historyContainer.querySelector('.btn-session-delete') as HTMLElement;
      expect(deleteBtn.querySelector('.svg-icon')).not.toBeNull();
      expect(deleteBtn.textContent).not.toContain('🗑');
    });
  });
});
