import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import type { BridgeContext } from "./types";

export class WorkspaceHandler {
  constructor(private readonly ctx: BridgeContext) {}

  public async handleApplyFileDiff(payload: { filePath: string; originalContent?: string; content: string }): Promise<void> {
    const adapter = this.ctx.workspaceAdapter;
    if (!adapter) return;
    const { filePath, originalContent, content } = payload;
    if (!originalContent) return;

    const currentContent = await adapter.readFile(filePath);
    if (currentContent !== originalContent) {
      vscode.window.showWarningMessage(`File ${filePath} has been modified since diff was generated.`);
      return;
    }

    const choice = await vscode.window.showWarningMessage(`Apply diff to ${filePath}?`, "Apply");
    if (choice !== "Apply") return;

    const recheckContent = await adapter.readFile(filePath);
    if (recheckContent !== originalContent) {
      vscode.window.showWarningMessage(`File ${filePath} changed while confirming.`);
      return;
    }

    if (adapter.applyFileEdit) {
      await adapter.applyFileEdit(filePath, originalContent, content);
    } else if (adapter.writeFile) {
      await adapter.writeFile(filePath, content);
    }
  }

  public async handleOpenDiffEditor(payload: { filePath: string; originalContent: string; modifiedContent: string }): Promise<void> {
    const { filePath, originalContent, modifiedContent } = payload;
    const tmpDir = path.join(os.tmpdir(), "acp-diff");
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const origPath = path.join(tmpDir, `${base}.original${ext}`);
    const modPath = path.join(tmpDir, `${base}.modified${ext}`);

    await fs.promises.writeFile(origPath, originalContent, "utf-8");
    await fs.promises.writeFile(modPath, modifiedContent, "utf-8");

    const origUri = vscode.Uri.file(origPath);
    const modUri = vscode.Uri.file(modPath);
    await vscode.commands.executeCommand("vscode.diff", origUri, modUri, `${path.basename(filePath)} (ACP Diff)`);
  }

  public async handleOpenFile(payload: { filePath: string; startLine?: number; endLine?: number }): Promise<void> {
    const { filePath, startLine, endLine } = payload;
    const workspaceFolders = vscode.workspace?.workspaceFolders;
    const root = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();

    let targetUri: vscode.Uri | undefined;
    const directPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const directUri = vscode.Uri.file(directPath);

    try {
      await vscode.workspace.fs.stat(directUri);
      targetUri = directUri;
    } catch {
      try {
        const basename = path.basename(filePath);
        const matches = await vscode.workspace.findFiles(`**/${basename}`);
        if (matches && matches.length > 0) {
          targetUri = matches.find((m) => m.fsPath.endsWith(filePath)) || matches[0];
        }
      } catch {}
    }

    if (!targetUri) targetUri = directUri;

    // Let VS Code select the native editor for text, images and binary resources.
    const options: vscode.TextDocumentShowOptions = {};
    if (startLine !== undefined) {
      options.selection = new vscode.Range(
        Math.max(0, startLine - 1), 0,
        Math.max(0, (endLine ?? startLine) - 1), 0,
      );
    }
    await vscode.commands.executeCommand("vscode.open", targetUri, options);
  }

  public async handleInsertCode(payload: { code: string }): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await editor.edit((builder) => {
      builder.insert(editor.selection.active, payload.code);
    });
  }
}
