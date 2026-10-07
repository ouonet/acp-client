import hljs from "highlight.js/lib/common";
import { escapeHtml } from "./markdown-file-links";

const aliases: Record<string, string> = {
  "c++": "cpp", "c#": "csharp", tsx: "typescript", jsx: "javascript", shell: "bash", sh: "bash", vue: "xml",
};
const tokenAliases: Record<string, string> = {
  built_in: "type", attr: "string", literal: "boolean",
};

/** Pure, language-aware highlighting; unknown fences remain escaped plain text. */
export function highlightCode(code: string, lang: string = "text"): string {
  const name = lang.toLowerCase().trim();
  const language = aliases[name] || name;
  if (!code || !hljs.getLanguage(language)) return escapeHtml(code);
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value.replace(
      /class="hljs-([^"]+)"/g,
      (_match, scope: string) => {
        const name = scope.split(" ")[0];
        const token = scope.includes("class_") ? "type" : tokenAliases[name] || name;
        return `class="token-${token}"`;
      },
    );
  } catch {
    return escapeHtml(code);
  }
}
