import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import taskLists from "markdown-it-task-lists";
import katex from "katex";
import { createCodeBlockHtml } from "./markdown-code-block";
import { tryFormatFileLink, formatPlainTextFilePaths } from "./markdown-file-links";

// One token parser for saved messages and incomplete streaming responses.
// Raw HTML is escaped and executable URL schemes are rejected by markdown-it.
const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
md.use(taskLists, { enabled: false });
md.use(texmath, {
  engine: katex,
  delimiters: ["dollars", "brackets"],
  katexOptions: { throwOnError: false, trust: false, strict: "ignore", maxExpand: 1000 },
});

const renderMath = (expression: string, displayMode: boolean) => {
  try {
    const html = katex.renderToString(expression, {
      displayMode, throwOnError: false, trust: false, strict: "ignore", maxExpand: 1000,
    });
    return displayMode ? `<div class="math-block">${html}</div>\n` : `<span class="math-inline">${html}</span>`;
  } catch {
    return md.utils.escapeHtml(expression);
  }
};
for (const name of ["math_inline", "math_inline_double", "math_block", "math_block_eqno"]) {
  md.renderer.rules[name] = (tokens, index) => renderMath(tokens[index].content, name !== "math_inline");
}

md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const lang = md.utils.unescapeAll(token.info).trim().split(/\s+/)[0] || "text";
  // Remove only the parser's final line break; preserve indentation and blank lines.
  return createCodeBlockHtml(lang, token.content.replace(/\n$/, "")) + "\n";
};
md.renderer.rules.code_block = (tokens, index) =>
  createCodeBlockHtml("text", tokens[index].content.replace(/\n$/, "")) + "\n";
md.renderer.rules.code_inline = (tokens, index) => {
  const text = tokens[index].content;
  return tryFormatFileLink(text, true) || `<code>${md.utils.escapeHtml(text)}</code>`;
};
md.renderer.rules.text = (tokens, index) => {
  // Text nested in a link must not acquire a second file-link target.
  let linkDepth = 0;
  for (let i = 0; i < index; i++) {
    if (tokens[i].type === "link_open") linkDepth++;
    if (tokens[i].type === "link_close") linkDepth--;
  }
  return linkDepth > 0 ? md.utils.escapeHtml(tokens[index].content) : formatPlainTextFilePaths(tokens[index].content);
};
md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const href = String(token.attrGet("href") || "");
  const fileLink = tryFormatFileLink(href);
  if (fileLink) {
    // Reuse the same path and line metadata as inline file references.
    const attributes = fileLink.match(/ data-(?:path|start-line|end-line)="[^"]*"/g)?.join("") || "";
    return `<a class="file-path-link" href="#"${attributes} title="Open file in editor">`;
  }
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return renderer.renderToken(tokens, index, options);
};
const tableOpen = md.renderer.rules.table_open;
md.renderer.rules.table_open = (tokens, index, options, env, renderer) =>
  '<div class="md-table-scroll">' + (tableOpen ? tableOpen(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options));
md.renderer.rules.table_close = () => "</table></div>\n";

export function renderMarkdown(markdown: string): string {
  return markdown ? md.render(markdown) : "";
}
export { tryFormatFileLink } from "./markdown-file-links";
