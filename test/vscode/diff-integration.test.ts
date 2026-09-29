import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { AcpViewProvider } from '../../src/vscode/acp-view-provider';
import type { IWorkspacePort } from '../../src/core/ports';

describe('T1: Diff Integration with VS Code Extension', () => {
  let mockWorkspaceAdapter: IWorkspacePort;
  let mockSessionHub: any;
  let mockProcessManager: any;
  let mockStorageManager: any;
  let provider: AcpViewProvider;

  beforeEach(() => {
    mockWorkspaceAdapter = {
      readFile: vi.fn().mockResolvedValue('original file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fileExists: vi.fn().mockResolvedValue(true),
      listDirectory: vi.fn().mockResolvedValue([]),
    };

    mockSessionHub = {
      getActiveSession: vi.fn(),
      listSessions: vi.fn().mockReturnValue([]),
      getSession: vi.fn(),
      onSessionListChange: vi.fn().mockReturnValue({ dispose: () => {} }),
      onActiveSessionChange: vi.fn().mockReturnValue({ dispose: () => {} }),
    };

    mockProcessManager = {
      getStatus: vi.fn().mockReturnValue('idle'),
      onStatusChange: vi.fn().mockReturnValue({ dispose: () => {} }),
    };

    mockStorageManager = {
      getAgentConfigs: vi.fn().mockResolvedValue([]),
      getInputHistory: vi.fn().mockResolvedValue([]),
    };

    provider = new AcpViewProvider({
      extensionUri: vscode.Uri.file('/mock/extension'),
      sessionHub: mockSessionHub,
      processManager: mockProcessManager,
      storageManager: mockStorageManager,
      workspaceAdapter: mockWorkspaceAdapter,
    });
  });

  it('should write applied diff content to workspace port on APPLY_FILE_DIFF', async () => {
    const handleAction = (provider as any).handleAction.bind(provider);

    await handleAction({
      type: 'APPLY_FILE_DIFF',
      payload: {
        filePath: '/workspace/src/example.ts',
        content: 'new modified content',
      },
    });

    expect(mockWorkspaceAdapter.writeFile).toHaveBeenCalledWith(
      '/workspace/src/example.ts',
      'new modified content'
    );
  });

  it('should call vscode.commands.executeCommand with vscode.diff on OPEN_DIFF_EDITOR', async () => {
    const executeCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');
    const handleAction = (provider as any).handleAction.bind(provider);

    await handleAction({
      type: 'OPEN_DIFF_EDITOR',
      payload: {
        filePath: '/workspace/src/example.ts',
        originalContent: 'line 1\nline 2',
        modifiedContent: 'line 1\nline 2 modified',
      },
    });

    expect(executeCommandSpy).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.stringContaining('example.ts')
    );
  });
});
