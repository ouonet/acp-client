import { describe, it, expect, vi } from 'vitest';
import {
  isWebviewAction,
  isExtensionMessage,
  type WebviewAction,
  type ExtensionMessage,
  type WebviewStateSnapshot,
} from '../../src/shared/ipc-protocol';
import { VsCodeWorkspaceAdapter } from '../../src/vscode/ports/vscode-workspace-adapter';

describe('T1: Shared IPC Protocol & VS Code Workspace Adapter', () => {
  describe('IPC Message Validation & Type Guards', () => {
    it('should correctly identify valid WebviewAction objects', () => {
      const validActions: WebviewAction[] = [
        { type: 'READY' },
        {
          type: 'SEND_PROMPT',
          payload: {
            sessionId: 'sess-1',
            prompt: 'Hello world',
            options: { model: 'gpt-4o', thinkingLevel: 'medium' },
          },
        },
        { type: 'CANCEL_PROMPT', payload: { sessionId: 'sess-1' } },
        {
          type: 'RESPOND_PERMISSION',
          payload: { sessionId: 'sess-1', requestId: 'req-1', decision: 'allow' },
        },
        {
          type: 'CREATE_SESSION',
          payload: { agentId: 'agent-1', title: 'New Chat' },
        },
        {
          type: 'FORK_SESSION',
          payload: { sourceSessionId: 'sess-1', options: { upToMessageIndex: 2 } },
        },
        {
          type: 'TEST_AGENT_CONNECTION',
          payload: {
            config: {
              id: 'agent-test',
              name: 'Test Agent',
              command: 'node',
              args: [],
              env: {},
              transport: 'stdio',
              enabled: true,
            },
          },
        },
      ];

      for (const action of validActions) {
        expect(isWebviewAction(action)).toBe(true);
      }

      // Invalid actions
      expect(isWebviewAction(null)).toBe(false);
      expect(isWebviewAction({})).toBe(false);
      expect(isWebviewAction({ type: 'UNKNOWN_TYPE_XYZ' })).toBe(false);
    });

    it('should correctly identify valid ExtensionMessage objects', () => {
      const snapshot: WebviewStateSnapshot = {
        sessions: [],
        agentConfigs: [],
        inputHistory: ['prev prompt 1'],
        processStatuses: { 'agent-1': 'running' },
      };

      const validMessages: ExtensionMessage[] = [
        { type: 'STATE_SNAPSHOT', payload: snapshot },
        {
          type: 'SESSION_EVENT',
          payload: {
            sessionId: 'sess-1',
            event: {
              type: 'chunk',
              sessionId: 'sess-1',
              payload: { text: 'chunk text' },
            },
          },
        },
        {
          type: 'PROCESS_STATUS_CHANGE',
          payload: { agentId: 'agent-1', status: 'running', pid: 1234 },
        },
        {
          type: 'TEST_CONNECTION_RESULT',
          payload: {
            success: true,
            protocolVersion: 1,
            durationMs: 45,
          },
        },
      ];

      for (const msg of validMessages) {
        expect(isExtensionMessage(msg)).toBe(true);
      }

      expect(isExtensionMessage(null)).toBe(false);
      expect(isExtensionMessage({ type: 'RANDOM' })).toBe(false);
    });
  });

  describe('VsCodeWorkspaceAdapter', () => {
    it('should read file, write file, and execute commands via provided VS Code mocks', async () => {
      const mockFiles = new Map<string, Uint8Array>();
      const mockFs = {
        readFile: vi.fn().mockImplementation(async (uri: any) => {
          const content = mockFiles.get(uri.fsPath);
          if (!content) throw new Error('File not found');
          return content;
        }),
        writeFile: vi.fn().mockImplementation(async (uri: any, bytes: Uint8Array) => {
          mockFiles.set(uri.fsPath, bytes);
        }),
      };

      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: 'cmd output',
        stderr: '',
        exitCode: 0,
      });

      const adapter = new VsCodeWorkspaceAdapter({
        fs: mockFs as any,
        commandExecutor: mockExecutor,
      });

      // Test write
      await adapter.writeFile('/workspace/test.txt', 'hello from adapter');
      expect(mockFs.writeFile).toHaveBeenCalled();

      // Test read
      const readContent = await adapter.readFile('/workspace/test.txt');
      expect(readContent).toBe('hello from adapter');

      // Test execute
      const cmdResult = await adapter.executeCommand('git status', '/workspace');
      expect(cmdResult.exitCode).toBe(0);
      expect(cmdResult.stdout).toBe('cmd output');
      expect(mockExecutor).toHaveBeenCalledWith('git status', '/workspace');
    });
  });
});
