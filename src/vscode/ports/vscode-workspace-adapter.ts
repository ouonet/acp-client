/**
 * VS Code Workspace Port Adapter
 * Implements IWorkspacePort for filesystem operations and terminal execution.
 */

import * as vscode from 'vscode';
import { exec } from 'node:child_process';
import { TextDecoder, TextEncoder } from 'node:util';
import type { IWorkspacePort } from '../../core/ports';

export interface VsCodeWorkspaceAdapterOptions {
  fs?: {
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
    writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
  };
  commandExecutor?: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export class VsCodeWorkspaceAdapter implements IWorkspacePort {
  private readonly fs: {
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
    writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
  };

  private readonly commandExecutor: (
    command: string,
    cwd?: string
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

  constructor(options?: VsCodeWorkspaceAdapterOptions) {
    this.fs = options?.fs || vscode.workspace.fs;
    this.commandExecutor = options?.commandExecutor || this.defaultExecuteCommand;
  }

  public async readFile(path: string): Promise<string> {
    const uri = vscode.Uri.file(path);
    const bytes = await this.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(path);
    const bytes = new TextEncoder().encode(content);
    await this.fs.writeFile(uri, bytes);
  }

  public async executeCommand(
    command: string,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.commandExecutor(command, cwd);
  }

  private defaultExecuteCommand(
    command: string,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      exec(command, { cwd }, (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || (err ? err.message : ''),
          exitCode: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
        });
      });
    });
  }
}
