import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/webview/components/chat-view";

describe("T2: Enhanced Markdown Renderer", () => {
  it("should render headers (h1, h2, h3)", () => {
    const md = "# Title 1\n## Section 2\n### Sub-section 3";
    const html = renderMarkdown(md);
    expect(html).toContain("<h1>Title 1</h1>");
    expect(html).toContain("<h2>Section 2</h2>");
    expect(html).toContain("<h3>Sub-section 3</h3>");
  });

  it("should render GFM markdown tables", () => {
    const md = `
| Name | Role | Status |
| :--- | :---: | ---: |
| Alice | Admin | Active |
| Bob | User | Pending |
`.trim();
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain(">Name</th>");
    expect(html).toContain(">Role</th>");
    expect(html).toContain(">Status</th>");
    expect(html).toContain(">Alice</td>");
    expect(html).toContain(">Admin</td>");
    expect(html).toContain(">Active</td>");
    expect(html).toContain(">Bob</td>");
  });

  it("should render blockquotes", () => {
    const md = "> This is a warning note.\n> Second line of note.";
    const html = renderMarkdown(md);
    expect(html).toContain("<blockquote");
    expect(html).toContain("This is a warning note.");
  });

  it("should render bullet lists and ordered lists", () => {
    const bulletMd = "- First item\n- Second item\n- Third item";
    const bulletHtml = renderMarkdown(bulletMd);
    expect(bulletHtml).toContain("<ul");
    expect(bulletHtml).toContain("<li>First item</li>");
    expect(bulletHtml).toContain("<li>Second item</li>");
    expect(bulletHtml).toContain("<li>Third item</li>");

    const orderedMd = "1. Step one\n2. Step two\n3. Step three";
    const orderedHtml = renderMarkdown(orderedMd);
    expect(orderedHtml).toContain("<ol");
    expect(orderedHtml).toContain("<li>Step one</li>");
    expect(orderedHtml).toContain("<li>Step two</li>");
    expect(orderedHtml).toContain("<li>Step three</li>");
  });

  it("should render fenced code blocks with language and copy action without insert button, with syntax highlighting", () => {
    const md = "```typescript\nconst x: number = 42;\nconsole.log(x);\n```";
    const html = renderMarkdown(md);
    expect(html).toContain('class="code-block-wrapper"');
    expect(html).toContain('class="code-lang">typescript</span>');
    expect(html).toContain('data-action="copy-code"');
    expect(html).not.toContain('data-action="insert-code"');
    expect(html).toContain('class="token-keyword">const</span>');
    expect(html).toContain('class="token-type">number</span>');
    expect(html).toContain('class="token-number">42</span>');
  });

  it("should render Mermaid diagrams in a dedicated container", () => {
    const md = "```mermaid\ngraph TD;\nA-->B;\n```";
    const html = renderMarkdown(md);
    expect(html).toContain("mermaid-diagram-wrapper");
    expect(html).toContain("Mermaid Diagram");
    expect(html).toContain("A--&gt;B");
  });

  it("should render PlantUML diagrams with SVG URL generator", () => {
    const md = "```plantuml\nAlice -> Bob: Hello\n```";
    const html = renderMarkdown(md);
    expect(html).toContain("plantuml-diagram-wrapper");
    expect(html).toContain("PlantUML Diagram");
    expect(html).toMatch(/plantuml\.com\/plantuml\/svg\/[0-9A-Za-z_-]+"/);
    expect(html).not.toContain("/svg/~h");
  });

  it("should render block and inline LaTeX math expressions with KaTeX", () => {
    const blockMd = "$$\\int_0^1 x^2 dx$$";
    const blockHtml = renderMarkdown(blockMd);
    expect(blockHtml).toContain("math-block");
    expect(blockHtml).toContain("katex");

    const inlineMd = "The formula is $E = mc^2$ in physics.";
    const inlineHtml = renderMarkdown(inlineMd);
    expect(inlineHtml).toContain("math-inline");
    expect(inlineHtml).toContain("katex");
  });

  it("should render bold, italic, inline code, and links", () => {
    const md =
      "Use **bold** and *italic* and `code` and [Docs](https://docs.anthropic.com).";
    const html = renderMarkdown(md);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain(
      '<a href="https://docs.anthropic.com" target="_blank"',
    );
    expect(html).toContain("Docs</a>");
  });

  it("should render horizontal rules", () => {
    const md = "Before line\n\n---\n\nAfter line";
    const html = renderMarkdown(md);
    expect(html).toContain("<hr");
    expect(html).toContain("Before line");
    expect(html).toContain("After line");
  });

  it("should handle mixed content without breaking code blocks", () => {
    const md = `
# Summary Report

Here is a table:

| Key | Value |
| --- | --- |
| timeout | 5000 |

And code:

\`\`\`json
{
  "key": "value"
}
\`\`\`

> End of report.
    `.trim();

    const html = renderMarkdown(md);
    expect(html).toContain("<h1>Summary Report</h1>");
    expect(html).toContain("<table");
    expect(html).toContain("timeout");
    expect(html).toContain('class="token-string">&quot;key&quot;</span>');
    expect(html).toContain('class="token-string">&quot;value&quot;</span>');
    expect(html).toContain("<blockquote");
  });
});
