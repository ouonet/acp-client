import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { VsCodeWorkspaceAdapter } from "../../src/vscode/ports/vscode-workspace-adapter";

describe("workspace read limit", () => {
  it("refuses a file larger than 1 MB before reading it", async () => {
    const readFile = vi.fn();
    vi.spyOn(vscode.workspace.fs, "stat").mockResolvedValue({ type: 1, size: 2_000_000 } as any);
    const adapter = new VsCodeWorkspaceAdapter({ fs: { readFile, writeFile: vi.fn() } });

    await expect(adapter.readFile("/tmp/huge.log")).rejects.toThrow(/1 MB/);
    expect(readFile).not.toHaveBeenCalled();
  });
});
