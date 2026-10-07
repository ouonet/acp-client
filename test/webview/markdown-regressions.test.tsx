// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { readFileSync } from "node:fs";
import { renderMarkdown } from "../../src/webview/components/chat-view";
import { AssistantTurn } from "../../src/webview/components/chat/assistant-turn";
import { ActionProvider } from "../../src/webview/state/action-context";

const root = document.createElement("div");
document.body.append(root);
afterEach(() => { render(null, root); vi.restoreAllMocks(); });
function parse(markdown: string) {
  const el = document.createElement("div");
  el.innerHTML = renderMarkdown(markdown);
  return el;
}

describe("Assistant Markdown regression coverage", () => {
  it("keeps nested lists, continuation paragraphs and ordered start numbers", () => {
    const el = parse("3. Parent\n   - Child\n\n     Child paragraph\n4. Next");
    expect(el.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(el.querySelector("ol > li > ul > li")?.textContent).toContain("Child paragraph");
  });

  it("renders tables without outer pipes and escaped pipes", () => {
    const el = parse("Name | Value\n--- | ---:\nA\\|B | `x`");
    expect(el.querySelectorAll("th")).toHaveLength(2);
    expect(el.querySelector("td")?.textContent).toBe("A|B");
  });

  it.each(["c++", "c#", "python", "rust", "go", "java", "sql", "bash", "html", "css", "yaml", "json", "tsx"])("renders %s fences with a language-aware highlighter", (lang) => {
    const samples: Record<string, string> = {
      "c++": "int main() { return 0; }", "c#": "public class App {}", python: "def greet():\n    return 'hello'", rust: "fn main() { let x = 1; }", go: "package main\nfunc main() {}", java: "public class App {}", sql: "SELECT name FROM users;", bash: "echo \"hello\"", html: "<div class=\"greeting\">Hi</div>", css: ".greeting { color: red; }", yaml: "enabled: true", json: '{"enabled": true}', tsx: "const view = <div>Hello</div>;",
    };
    const el = parse(`\`\`\`${lang}\n${samples[lang]}\n\`\`\``);
    expect(el.querySelector(".code-lang")?.textContent).toBe(lang);
    expect(el.querySelector("pre code span")).not.toBeNull();
    expect(el.querySelector("pre code")?.textContent).toBe(samples[lang]);
  });

  it("keeps code indentation, blank lines and Markdown/math literally inside fences", () => {
    const code = "  **literal** $x$\n\n    tail  ";
    expect(parse(`~~~unknown-language\n${code}\n~~~`).querySelector("pre code")?.textContent).toBe(code);
  });

  it("handles incomplete streaming fences and closing them without losing content", () => {
    const partial = "```c++\n  int value = 1;";
    const first = parse(partial).querySelector("pre code")?.textContent;
    expect(first).toBe("  int value = 1;");
    expect(parse(partial + "\n```\n\nDone").querySelector("pre code")?.textContent).toBe(first);
  });

  it("supports dollar and LaTeX inline/display delimiters without formatting code as math", () => {
    const el = parse(String.raw`Inline $x^2$ and \(y^2\). Code: \`$literal$\`.

\[
\frac{a}{b}
\]

$$
\sum_{i=1}^n i
$$`.replaceAll("\\`", "`"));
    expect(el.querySelectorAll(".math-inline .katex")).toHaveLength(2);
    expect(el.querySelectorAll(".math-block .katex")).toHaveLength(2);
    expect(el.querySelector("code")?.textContent).toBe("$literal$");
  });

  it("escapes HTML and rejects executable links while rendering emphasis inside links", () => {
    const el = parse('<img src=x onerror=alert(1)> [bad](javascript:alert(1)) [**Docs**](https://example.com)');
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(el.querySelector("a strong")?.textContent).toBe("Docs");
  });

  it("copies the exact code from the Preact response", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    render(<AssistantTurn message={{ content: "```python\n  print('hello')\n```" }} />, root);
    await act(async () => { (root.querySelector('[data-action="copy-code"]') as HTMLButtonElement).click(); });
    expect(writeText).toHaveBeenCalledWith("  print('hello')");
  });

  it("opens file links with their line range through structured actions", () => {
    const send = vi.fn();
    render(<ActionProvider onAction={send}><AssistantTurn message={{ content: "[Source](src/index.ts:12-14)" }} /></ActionProvider>, root);
    (root.querySelector(".file-path-link") as HTMLElement).click();
    expect(send).toHaveBeenCalledWith({ type: "OPEN_FILE", payload: { filePath: "src/index.ts", startLine: 12, endLine: 14 } });
  });

  it("renders Mermaid in a completed Preact response and keeps streaming source visible", async () => {
    vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg aria-label="Flowchart"><text>Start</text></svg>' }) } }));
    const { default: mermaid } = await import("mermaid");
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg aria-label="Flowchart"><text>Start</text></svg>', diagramType: "flowchart" });
    await act(async () => { render(<AssistantTurn isStreaming message={{ content: "```mermaid\ngraph TD; A-->B;" }} />, root); });
    expect(root.querySelector(".mermaid-svg-container")?.textContent).toContain("graph TD");
    await act(async () => { render(<AssistantTurn message={{ content: "```mermaid\ngraph TD; A-->B;\n```" }} />, root); });
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    expect(root.querySelector(".mermaid-svg-container svg")).not.toBeNull();
  });

  it("loads KaTeX CSS locally and styles the actual code wrapper and token classes", () => {
    const index = readFileSync("src/webview/styles/index.css", "utf8");
    const css = readFileSync("src/webview/styles/code.css", "utf8");
    expect(index).toContain("katex/dist/katex.min.css");
    expect(css).toContain(".code-block-wrapper");
    expect(css).toContain(".token-keyword");
  });
});
