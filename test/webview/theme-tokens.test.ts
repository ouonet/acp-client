import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const tokens = readFileSync("src/webview/styles/tokens.css", "utf8");
const chat = readFileSync("src/webview/styles/chat.css", "utf8");
const lifecycle = readFileSync("src/webview/styles/lifecycle.css", "utf8");
const modelPicker = readFileSync("src/webview/styles/model-picker.css", "utf8");

describe("webview theme surfaces", () => {
  it("uses sidebar theme colors for the sidebar-hosted webview", () => {
    expect(tokens).toContain(
      "--bg-primary: var(--vscode-sideBar-background, var(--vscode-editor-background, #1e1e1e));",
    );
    expect(tokens).toContain(
      "--fg-primary: var(--vscode-sideBar-foreground, var(--vscode-editor-foreground, var(--vscode-foreground, #cccccc)));",
    );
  });

  it("uses the webview surface token rather than editor colors for local surfaces", () => {
    for (const css of [chat, lifecycle, modelPicker]) {
      expect(css).not.toContain("var(--vscode-editor-background");
      expect(css).not.toContain("var(--vscode-editor-foreground");
    }
  });
});
